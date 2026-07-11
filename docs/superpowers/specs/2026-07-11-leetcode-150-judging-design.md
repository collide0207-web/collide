# LeetCode Top 150 Integration with Full Judging — Design Spec

**Date:** 2026-07-11
**Status:** Approved for planning
**Scope:** Replace the NeetCode 150 sheet with LeetCode "Top Interview 150", hosting full
in-app content for all 150 problems and a real judging system (~100 hidden test cases per
problem, edge coverage, and time-complexity / TLE enforcement).

Spans two repos: `collide/` (React/TS frontend) and `collab/collab/control/` (Spring Boot
control plane). This is the master spec; each sub-project (SP1–SP4) gets its own
implementation plan.

---

## 1. Decisions locked

| Decision | Choice |
|---|---|
| Coexistence with NeetCode 150 | **Replace** — `leetcode150` becomes the single sheet |
| Content depth | **Full for all 150** — statement, examples, constraints, starter code, harness |
| Harness type coverage | **Extend to cover all** — `list-node`, `tree-node`, design/`operations` mode |
| Judging depth | **Full pipeline** — ~100 hidden cases/problem, server-side Submit, TLE enforcement |
| Test-bundle storage | **Object storage / mounted volume** (gzipped per-problem bundles), not Postgres rows |
| Reference/oracle language | **Python** for all reference solutions, generators, validators, checkers |
| Spec structure | **One master spec** (this doc) → per-SP implementation plans |

---

## 2. Architecture: two judging tiers

The core split. **Run** and **Submit** are different tiers with different code paths.

| | **Run** (already exists) | **Submit** (new) |
|---|---|---|
| Cases | 3–10 visible samples | ~100 hidden cases |
| Executed by | Client-side codegen + existing execution service | Server-side `JudgeService` in control plane |
| Purpose | Instant feedback while coding | Authoritative verdict + TLE + edge coverage |
| Comparison | `outputMatches` in browser | Batch runner + checker, anti-tamper (`userId` from JWT) |

**Submit data flow:** frontend sends `{slug, language, source}` → `JudgeService` loads the
problem's cached **test bundle** → compiles the user solution **once** → runs each case with a
per-case wall-clock limit → applies the problem's **checker** → aggregates a verdict → stores a
`submissions` row → streams the result back over the existing status/WebSocket path.

The instant Run loop is untouched; real judging is added only where it earns its cost.

---

## 3. The ~100 cases per problem: composition

A generator emits a **weighted budget**, not 100 random cases:

| Bucket | Count | Purpose |
|---|---|---|
| Edge catalog (deterministic, per problem) | ~30 | empty, singleton, all-equal, min/max bounds, negatives, duplicates, sorted, reverse-sorted, two-element, overflow-adjacent |
| Random small (cross-checked vs brute force) | ~35 | correctness fuzzing where a brute solution can verify |
| Random medium | ~20 | typical-size correctness |
| Max-size stress (constraint ceiling + adversarial) | ~15 | **TLE detection** — worst-case patterns at `n = n_max` |

**Time-complexity enforcement = time limit + stress cases.** Each problem carries a
`timeLimitMs`, derived by measuring the reference solution at `n_max` and applying a
per-language safety factor (e.g. Python 5×, C++ 3×, Java 4×, Node 4×). An O(n²) submission
exceeds the limit on the max-size stress cases → **TLE**. There is no static big-O analysis;
TLE is caught empirically with adversarial max-size inputs under a tight clock.

---

## 4. The contract: extended harness metadata + checker spec

Everything keys off the per-problem harness JSON in the seed. Extensions:

- **New param/return types:**
  - `list-node` — singly linked list, wire form `[1,2,3]`
  - `tree-node` — binary tree, LeetCode level-order form with nulls `[1,null,2,3]`
  - **`operations` mode** for design problems: input is a sequence
    `[["LRUCache",[2]],["put",[1,1]],["get",[1]]]` with an expected array of returns.
- **Checker spec** (`judge` field) — used by BOTH tiers:
  - `"exact"` — canonical JSON equality (default)
  - `"unordered"` — set/multiset equality (e.g. Two Sum indices, group anagrams)
  - `"float:<eps>"` — floating tolerance
  - `"custom:<checkerId>"` — per-problem checker program ("return any valid answer")
- **`timeLimitMs`** and **`memoryLimitKb`** per problem.

This JSON is the single contract shared by client codegen, the CI generator, and the server
judge. Locking it is the reason SP1 is sequenced first.

---

## 5. Data & storage

- **Catalog** → Postgres `problems` table (exists). Seeded from `seed/leetcode150.json` in git.
  Sheet becomes `leetcode150`. Seeder gains **orphan pruning**: after upserting the active seed,
  delete rows whose slug is absent from it, so "replace" leaves no NeetCode-only orphans.
- **Authoring artifacts (git)** — per problem, the source of truth for judging:
  ```
  control/testdata/<slug>/
    reference.py     # oracle — produces all expected outputs
    brute.py         # optional slow/obvious solution (cross-validates the oracle)
    generator.py     # emits the weighted ~100 cases with a fixed RNG seed
    validator.py     # asserts each input satisfies constraints
    checker.py       # optional; for non-unique answers
    meta.json        # bucket counts, RNG seed, timeLimitMs, checker type
  ```
- **Generated cases (NOT git, NOT seed JSON)** → CI runs the generator and bundles
  `{input, expected}[]` into a **gzipped artifact per problem version** in object storage /
  mounted volume. A `problem_test_bundle` table registers
  `(problemId, version, checksum, caseCount, storageKey, timeLimitMs, checkerType)`. The judge
  loads and caches bundles by version/checksum.
- **Submissions** → new `submissions` table:
  `(id, userId, problemId, language, sourceHash, verdict, passed, total, failingCaseIndex,
  runtimeMs, memoryKb, createdAt)`.

Generated cases are reproducible from git via the seeded generator — never hand-maintained,
never committed.

---

## 6. CI test-generation pipeline (SP3)

Per changed problem folder, a deterministic CI job:

1. `generator.py` → candidate inputs (fixed seed → reproducible).
2. `validator.py` on each → reject illegal inputs (guards generator bugs).
3. On small inputs: assert `brute.py` == `reference.py` → **validates the oracle** (two
   independent implementations agreeing is the correctness proof).
4. `reference.py` on all inputs → expected outputs.
5. Bundle + gzip + checksum → upload artifact → upsert `problem_test_bundle`.

Bump bundle version when a problem's generator/reference changes; the checksum self-invalidates
stale judge caches.

---

## 7. Server-side judge + batch runner (SP4)

Reuses the existing `LanguageExecutor` sandbox (`Python/Node/Cpp/JavaExecutor`). New
`JudgeService`:

1. Load + cache the test bundle (Redis for multi-node).
2. **Compile once** (compiled languages). Build a per-language **batch driver** with a minimal
   deserializer for the canonical wire format (int/array/`list-node`/`tree-node`/operations).
   This one-time-per-language deserializer replaces literal-baking for the server path (written
   once per language, not per problem).
3. **Run per case with an individual `timeLimitMs` wall-clock guard** so TLE/RE is attributable
   to a specific case and a hang on case k doesn't lose the rest.
4. Apply the **checker** per case (exact/unordered/float/custom).
5. Aggregate → verdict `AC | WA | TLE | RE | CE | MLE`, `passed/total`, first failing index,
   max runtime/memory. **Early-exit on first failure** (LeetCode-style) to save compute.
6. Persist `submissions`; stream the verdict back.

**Endpoint:** `POST /api/problems/{slug}/submit {language, sourceCode}` → `{submissionId,
status: PENDING}`, then reuse the existing status/result/WebSocket streaming. `userId` comes
from the JWT, never the client — the anti-tamper boundary.

**Security/scale:** reuse `RateLimiter`; code-size caps; no-network sandbox; output caps;
memory cap = `memoryLimitKb`.

---

## 8. Frontend Submit UX (SP4)

- **Submit** button beside **Run**. Run = samples/instant/client; Submit = hidden/server.
- **Verdict panel:** `Accepted | Wrong Answer | Time Limit Exceeded | Runtime Error | Compile
  Error`, with `87 / 100 passed`, runtime, memory.
- Hidden cases stay hidden: on WA show only `Wrong answer on test 42` (index + verdict), never
  the hidden input. Sample failures still show the full diff.
- Accepted → `updateProgress({completed:true})` marks the problem solved. Submissions history
  per problem.

---

## 9. Testing strategy

- **Oracle/generator:** the brute-vs-reference cross-check *is* the test.
- **Judge golden tests:** per problem, a known-correct solution must return AC, a known-O(n²)
  must return TLE on stress, a known-wrong must return WA. These are the judge's integration
  tests.
- **Harness codegen:** unit tests per new type × language, extending the existing `harness`
  tests.

---

## 10. Phased implementation (build order)

- **SP1 — Catalog replacement.** Seed swap; orphan-pruning seeder; author all 150 (statements,
  starter, sample cases); extended harness *schema* (type tags + checker spec, parsing only).
  *Ships a browsable/solvable LeetCode 150 for harness-expressible problems.*
- **SP2 — Harness extension.** `list-node`/`tree-node`/`operations` codegen across all 4
  languages, client-side. *All 150 runnable against their sample cases.*
- **SP3 — Test-data pipeline.** reference/brute/generator/validator/checker per problem + CI
  bundling + `problem_test_bundle` registry. *Hidden suites exist and are reproducible.*
- **SP4 — Judge + Submit.** Batch runner, server-side checkers, Submit endpoint, verdict UX,
  submissions. *Real hidden judging live.*

Each SP gets its own implementation plan. SP1 is sequenced first because it locks the harness /
checker contract that SP2–SP4 depend on.

---

## 11. Open items deferred to per-SP plans

- Exact object-storage backend (MinIO locally vs S3 in prod) — swappable behind an interface,
  mirroring the existing `DocStore`/`PubSub` fallback pattern.
- Per-case memory measurement (RSS via cgroups / `/usr/bin/time`) — best-effort, may land late
  in SP4.
- Whether the batch driver streams all cases through one process vs re-invokes the compiled
  binary per case — decided in SP4 against measured process-spawn overhead; per-case isolation
  is the requirement either way.
