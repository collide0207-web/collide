# SP3 — Test-Data Pipeline — Design Spec

**Date:** 2026-07-11
**Status:** Approved for planning
**Parent:** `2026-07-11-leetcode-150-judging-design.md` (master spec §5–6, §10 build order)
**Predecessors:** SP1 (catalog replacement) ✅, SP2 (harness extension / Run codegen) ✅

## 1. Goal

Produce the **reproducible hidden test suites** that SP4's server-side judge will consume:
per-problem authoring artifacts (generator / validator / reference / optional brute / optional
checker), a deterministic bundling step that emits a gzipped `{input, expected}[]` artifact +
checksum per problem, and a `problem_test_bundle` registry in the control plane that records
each bundle. *Hidden suites exist and are reproducible.*

SP3 does **not** run user submissions or produce verdicts — that is SP4. SP3 stops at
"a bundle exists, is registered, and can be loaded."

## 2. Decisions locked (this SP)

| Decision | Choice | Rationale |
|---|---|---|
| Pipeline language | **Node/TypeScript** (deviation from master §1's Python) | Python is not installed in the target env; Node 24 is. The canonical output format is `JSON.stringify`, which Node emits natively — eliminates a serialization-mismatch class. Wire/canonical contract is unchanged. |
| Coverage this pass | **Pilot slice of 7 problems + full framework** | Authoring 149 well in one pass is infeasible; the framework + registry + storage is the scalable deliverable, proven across every checker × wire type. |
| Bundle storage | **`BundleStore` interface + `LocalBundleStore` (filesystem) default** | Mirrors the `DocStore`/`PubSub` swappable-with-fallback pattern; zero infra locally. S3/MinIO is a later swap-in (master §11). |
| Bundle registry | Postgres `problem_test_bundle` (migration V8) seeded from a committed `manifest.json` | Mirrors `ProblemSeeder`: git is source of truth, DB is derived on boot. |

## 3. Architecture — two sides, one contract

The contract between the two sides is: **a gzipped bundle file + a manifest row.**

```
testgen (Node)  --writes-->  bundles/<slug>.v<version>.json.gz   +   manifest.json
                                        |                                  |
control (Java)  <--reads via BundleStore                <--TestBundleSeeder upserts rows
```

### 3a. Node/TS authoring pipeline — `collab/collab/control/testgen/`

A sibling Node package (own `package.json`, `tsconfig.json`, Vitest). Layout:

```
testgen/
  package.json  tsconfig.json  vitest.config.ts
  src/
    framework/
      wire.ts       # list/tree/graph (de)serializers — mirror SP2 canonical forms
      rng.ts        # seeded deterministic PRNG (mulberry32)
      buckets.ts    # weighted budget: edge / random-small / random-medium / max-stress
      checkers.ts   # exact | unordered | float:<eps>  (used for brute-vs-reference cross-check)
      bundle.ts     # assemble -> JSON -> gzip -> sha256 -> write to BundleStore -> manifest row
      types.ts      # ProblemModule, Meta, Bundle, ManifestEntry
      registry.ts   # maps slug -> ProblemModule for the pilot set
    problems/
      two-sum.ts  majority-element.ts  merge-two-sorted-lists.ts
      invert-binary-tree.ts  clone-graph.ts  min-stack.ts  powx-n.ts
    cli/
      build-bundles.ts   # runs the whole pipeline for the registered problems
  test/
    wire.test.ts  checkers.test.ts  buckets.test.ts  pipeline.test.ts
```

**Per-problem module contract** (`ProblemModule`):

```ts
interface ProblemModule<In extends unknown[], Out> {
  meta: Meta                              // slug, version, rngSeed, bucketBudget, timeLimitMs, checker
  generator(rng: Rng, budget: BucketBudget): In[]   // deterministic candidate inputs
  validator(input: In): void              // throws if input violates the problem's constraints
  reference(...input: In): Out            // the oracle — native structures in/out
  brute?(...input: In): Out               // optional slow/obvious solution for cross-check
  checker?: Checker                       // optional non-exact checker (else meta.checker string)
}
```

**`build-bundles` pipeline** (per problem, spec §6):
1. `generator(seededRng, budget)` → candidate inputs (fixed seed ⇒ reproducible).
2. `validator(input)` on each → reject illegal inputs (guards generator bugs).
3. On the small-bucket inputs: assert `brute(input)` matches `reference(input)` under the
   problem's checker → **oracle validation** (two independent impls agreeing).
4. `reference(input)` on all inputs → expected outputs.
5. Assemble `{input, expected}[]`; verify each `{input, expected}` also round-trips through the
   **wire (de)serializers** (so the bundle is exactly what a language driver will see).
6. `JSON.stringify` (canonical) → gzip → sha256 checksum → write
   `bundles/<slug>.v<version>.json.gz` via `BundleStore` → append `ManifestEntry`.

**Wire fidelity:** `wire.ts` reproduces SP2's `__toList/__fromList`, `__toTree/__fromTree`
(trailing-null trim), `__toGraph/__fromGraph` (1-indexed adjacency, sorted neighbours) exactly,
and is unit-tested against the same fixtures SP2 used. `operations` inputs/expected are passed
through unchanged (already canonical arrays per SP2's locked contract).

### 3b. Java registry + storage — `control/`

- **`V8__problem_test_bundle.sql`**:
  ```sql
  CREATE TABLE problem_test_bundle (
    id             BIGSERIAL PRIMARY KEY,
    problem_slug   VARCHAR(160) NOT NULL,
    version        INT NOT NULL,
    checksum       VARCHAR(64) NOT NULL,
    case_count     INT NOT NULL,
    storage_key    VARCHAR(300) NOT NULL,
    time_limit_ms  INT,
    checker_type   VARCHAR(40) NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (problem_slug, version)
  );
  ```
- `ProblemTestBundle` entity + `ProblemTestBundleRepository` (Spring Data JPA).
- **`BundleStore` interface** — `byte[] load(String storageKey)`, `boolean exists(String key)`.
  `LocalBundleStore` reads gzipped bundle bytes from a configured root dir
  (`collide.testbundles.dir`, default the committed resources dir below). Judge (SP4)
  decompresses + parses.
- **Single committed location** = `control/src/main/resources/seed/test-bundles/`. The pipeline
  writes both the gzip artifacts (`<slug>.v<version>.json.gz`) and `manifest.json` there; the
  `LocalBundleStore` default root and the seeder both read from there. One dir, git source of
  truth, no path drift.
- **`TestBundleSeeder`** (`ApplicationRunner`, like `ProblemSeeder`): reads the committed
  `manifest.json`, and for each entry upserts a `problem_test_bundle` row keyed by
  `(problem_slug, version)`, so the seeder and a future judge point at real files.

## 4. Pilot slice (7 problems)

| slug | signature | checker | wire coverage |
|---|---|---|---|
| `two-sum` | `int[],int -> int[]` | **unordered** | array + unordered checker; brute O(n²) |
| `majority-element` | `int[] -> int` | exact | array→scalar; brute = count map |
| `merge-two-sorted-lists` | `list-node,list-node -> list-node` | exact | **list-node** in+out |
| `invert-binary-tree` | `tree-node -> tree-node` | exact | **tree-node** in+out (null-trim serialize) |
| `clone-graph` | `graph-node -> graph-node` | exact | **graph-node** adjacency |
| `min-stack` | `operations -> operations` | exact | **operations** driver mode |
| `powx-n` | `double,int -> double` | **float:1e-5** | float checker + scalar double |

Covers checkers `exact` + `unordered` + `float`, and wire types scalar/array/list/tree/graph/
operations. The remaining 142 problems are mechanical follow-on authored against the same
framework (out of scope for this SP).

## 5. Testing strategy

- **Framework units** (Vitest): `wire.ts` round-trips vs SP2 fixtures; `checkers.ts` (exact/
  unordered/float boundary); `buckets.ts` budget composition; seeded `rng.ts` reproducibility.
- **Per-problem golden** (Vitest): for each pilot problem, `reference` reproduces the seed's
  sample-case `expected`; `brute` matches `reference` on the small bucket; every generated case
  passes `validator`.
- **Pipeline** (Vitest + real CLI run): `build-bundles` produces N bundles + a manifest;
  re-running yields **identical checksums** (determinism proof).
- **Java** (JUnit, no DB): `LocalBundleStore` round-trip (write gz → load → gunzip → equals);
  manifest JSON parsing. `./gradlew compileJava` gates the entity/repo/seeder.

## 6. Verification constraints in the target environment (honest)

- ✅ Node pipeline + Vitest run fully; bundles + manifest are produced and committed for the pilot.
- ✅ `./gradlew compileJava` + pure-JUnit `LocalBundleStore`/manifest unit tests run (no infra).
- ⚠️ `TestBundleSeeder`'s Postgres upsert is **Docker/testcontainers-gated and NOT runnable
  here** (no Docker). It is structured to be testcontainers-ready; only its non-DB parsing logic
  is unit-verified this pass. This is the single known unverified surface.

## 7. Out of scope (deferred to SP4 or later)

- Server-side judge / batch runner / Submit endpoint / verdict UX (SP4).
- S3/MinIO `BundleStore` implementation (swap-in; interface is defined now).
- Authoring the other 142 problems.
- Per-case memory measurement.
- `quad-tree` wire support (single problem; deferred with its judging to a later pass).
