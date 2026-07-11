# SP4 — Judge + Submit — Design Spec

**Date:** 2026-07-11
**Status:** Approved for planning
**Parent:** `2026-07-11-leetcode-150-judging-design.md` (master spec §7–9, §10 build order)
**Predecessors:** SP1 (catalog replacement) ✅, SP2 (harness extension / Run codegen) ✅,
SP3 (test-data pipeline / hidden bundles + registry) ✅

## 1. Goal

Turn the reproducible hidden test bundles SP3 produced into **real server-side judging**: a
`POST /api/problems/{slug}/submit` endpoint that compiles a user's solution once, runs it against
the ~100 hidden cases with a per-case wall-clock guard, applies the problem's checker, aggregates
an authoritative verdict (`AC | WA | TLE | RE | CE`), persists a `submissions` row, and surfaces a
verdict panel + submissions history in the frontend. *Real hidden judging live.*

The instant **Run** loop (client-side codegen against 3–10 sample cases) is untouched. SP4 adds
**Submit** as a separate tier, only where authoritative judging earns its cost (master spec §2).

## 2. Decisions locked (this SP)

| Decision | Choice | Rationale |
|---|---|---|
| Case execution model | **Per-case process invocation** — compile once, invoke the compiled program once per case, feeding that case's input on stdin, with `timeLimitMs` as the process wall-clock. | Reuses the existing `ProcessManager` timeout/kill contract verbatim; gives true per-case TLE **attribution** and guarantees a hang on case *k* can't lose the rest (master spec §7.3). LeetCode-style early-exit on first failure caps the spawn count. |
| Driver strategy | **Generic stdin-reading driver per language** (written once per language, not per problem). | Master spec §7.2. The judge compiles once, so it can't bake per-case literals the way client Run does; instead a fixed per-language deserializer reads each case's input from stdin. |
| Language coverage | **Write all 4 (JS/Python/C++/Java) drivers; execute+verify JS and Java live.** | Only Node 24 and Java 17 exist in this env; g++/python3 do not. Python/C++ drivers are codegen/string unit-tested only, with SP3's honest "toolchain-gated, not executed here" caveat. This pass also implements the C++/Java **operations** dispatch SP2 explicitly deferred to SP4. |
| Streaming path | **Reuse `ExecutionPublisher` / WS**, not a new transport. | Master spec §7 "reuse the existing status/result/WebSocket path." |
| Judge scope | **Generic judge** driven entirely by `ProblemHarness` + the bundle registry. | Works for all 7 pilot bundles today and any of the other 142 the moment their bundle exists — no per-problem judge code. |
| Custom checker | **Deferred** (`custom:<id>` → "unsupported" 4xx). | No pilot problem uses it; `exact`/`unordered`/`float` cover the pilot set. |

## 3. Architecture — one new package on existing primitives

A new `app.collide.control.judge` package. It **composes** the `execution/` building blocks and
adds nothing to the Run path:

- reuses `ProcessManager` (isolated working dir, argv-only, per-process wall-clock + force-kill),
- reuses `FileManager` / `Workspace` (try-with-resources temp dir, always cleaned up),
- reuses `LanguageExecutorFactory` → `LanguageExecutor` (source filename, compile cmd, run cmd),
- reuses `ExecutionQueue` (off the request thread) and `ExecutionPublisher` (live events),
- reuses `problem.bundle.BundleStore` + `ProblemTestBundleRepository` (SP3).

### 3a. Data flow

```
POST /api/problems/{slug}/submit  {language, sourceCode}          (userId ← JWT, never client)
   → SubmissionService.submit(userId, slug, language, sourceCode)
        validate (size caps, language allow-list, harness+bundle exist)
        persist submissions row (status PENDING), return {submissionId, status: PENDING}
        queue.submit(() -> JudgeService.judge(submissionId, ...))         // off request thread

JudgeService.judge:
   1. load Problem + ProblemHarness (by slug); load active ProblemTestBundle (by slug, max version)
   2. TestBundleLoader: BundleStore.load(storageKey) → gunzip → parse Case[]  (cache by checksum)
   3. JudgeDriverGenerator.generate(language, harness, userSource) → one complete program
      compile once (compiled langs) via LanguageExecutor.compile; CE short-circuits to verdict CE
   4. for each case, early-exit on first non-AC:
        ProcessManager.run(runCmd, workspace, stdinFile=case.input JSON, timeoutMs=timeLimitMs)
        classify: timedOut → TLE ; exit≠0 → RE ; else Checker.check(stdout, case.expected) → AC/WA
        track passed++, maxRuntimeMs, first failing index
   5. aggregate Verdict{status, passed, total, failingCaseIndex, maxRuntimeMs}
   6. update submissions row; publisher.publish(submissionId, verdict event)   // reuse WS path
```

### 3b. Components (each has one purpose, testable in isolation)

| Unit | Responsibility | Depends on |
|---|---|---|
| `JudgeDriverGenerator` | Per-language codegen: emit a program that reads one JSON case `[arg0,…]` from stdin, deserializes each arg by param `type`, calls `Solution.entry(...)`, serializes the return canonically, prints it. Plus the **operations** driver. | `ProblemHarness` |
| `WirePreludes` | The ported SP2 `__toList/__fromList`, `__toTree/__fromTree`, `__toGraph/__fromGraph` + a minimal JSON reader, one constant block per language. | — |
| `Checker` (+ `ExactChecker`, `UnorderedChecker`, `FloatChecker`) | `boolean check(String stdout, Object expected)`. Parsed from the harness `judge` string. | Jackson |
| `TestBundleLoader` | Resolve active bundle (max version) for a slug, load+gunzip via `BundleStore`, parse `Case[]`, cache by checksum. | `ProblemTestBundleRepository`, `BundleStore` |
| `JudgeService` | Orchestrate compile-once → per-case run → classify → checker → aggregate → publish. | all execution primitives above |
| `SubmissionService` | Validate, persist PENDING row, enqueue, expose get/list; write final verdict. | `SubmissionRepository`, `ExecutionQueue`, `JudgeService` |
| `SubmissionController` | `POST /api/problems/{slug}/submit`; `GET /api/submissions/{id}`; `GET /api/problems/{slug}/submissions`. | `SubmissionService` |
| `Submission` (+ repo, `V9__submissions.sql`) | Persisted submission record. | JPA |

### 3c. The generic stdin-reading driver

For each case the driver receives **one line of JSON** on stdin: the `input` array from the bundle
(`[arg0, arg1, …]`, each arg already in SP2 canonical wire form). The driver:

1. parses that line into an array,
2. deserializes each element by the declared param `type` — scalars/arrays natively; `list-node`
   via `__toList`, `tree-node` via `__toTree` (LeetCode level-order + null trim), `graph-node` via
   `__toGraph` (1-indexed adjacency, sorted neighbours), `array<list-node>` element-wise,
3. calls `Solution.entry(...)`,
4. serializes the return with the matching `__fromX` (object types) or canonical scalar/array
   printer, printing **exactly** the same canonical JSON the bundle's `expected` was produced with
   (SP3 wire fidelity guarantees bit-for-bit agreement).

For **operations** problems the single "input" is the ops sequence
`[[Ctor,[ctorArgs]],[method,[args]],…]`; the driver instantiates the class, dispatches each op,
collects returns (ctor slot + void methods = `null`), and prints the returns array — the locked SP2
contract. C++/Java now implement void-vs-value dispatch (the piece SP2 deferred here).

The deserializers are **fixed per language** (not per problem); only which ones are injected and the
call signature vary — exactly parallel to `harness.ts`'s `preludeFor` + `argExpr`, so the two stay
behaviourally identical and are tested against the same fixtures.

## 4. Verdict semantics

`Verdict{ status, passed, total, failingCaseIndex, maxRuntimeMs }`, `status ∈ {AC,WA,TLE,RE,CE}`:

- Compilation fails (compiled langs) → `CE` (no cases run).
- Per case: `ProcessResult.timedOut()` → `TLE`; non-zero exit / crash (`exitCode≠0`) → `RE`;
  otherwise `Checker.check` false → `WA`; true → case passes.
- All cases pass → `AC`.
- **Early-exit on first non-AC** (LeetCode-style) — `failingCaseIndex` is that case's index,
  `passed` is the count before it. On `AC`, `failingCaseIndex = -1`, `passed = total`.
- `timeLimitMs` comes from the bundle registry row (`ProblemTestBundle.timeLimitMs`, default 2000).
- **Hidden inputs never leak.** A WA/TLE/RE response carries only `failingCaseIndex` + status +
  counts — never the hidden input or expected value. (Sample-case diffs stay in the Run tier.)

## 5. Anti-tamper & limits (reuse existing guards)

- `userId` is taken from the authenticated `AuthPrincipal` (JWT), **never** a client field — the
  same boundary the execution and auth code already enforce.
- Source-size cap, argv-only process launch, per-process wall-clock + force-kill, output caps: all
  inherited from `ExecutionService`'s configuration and `ProcessManager`. Submit adds a per-case
  count cap = the bundle's `caseCount`.
- Ownership: `GET /api/submissions/{id}` returns only the caller's own submissions (mirrors
  `ExecutionService.requireOwnedBy`).

## 6. Frontend Submit UX

- **Submit** button beside **Run** in `src/run/`. Run = samples / instant / client; Submit =
  hidden / server / authoritative.
- Calls `api.submitSolution(slug, {language, sourceCode})` → `{submissionId}`, then polls (or
  streams over the existing WS) `api.getSubmission(submissionId)` until terminal.
- **Verdict panel:** `Accepted | Wrong Answer | Time Limit Exceeded | Runtime Error | Compile
  Error`, with `87 / 100 passed`, runtime. On WA/TLE/RE show only `… on test 42` (index), never a
  hidden input. On `CE` show the compiler stderr (it's the user's own code).
- **Accepted → `updateProgress({completed:true})`** marks the problem solved.
- **Submissions history** per problem (verdict + language + time), from
  `GET /api/problems/{slug}/submissions`.
- `api/types.ts` gains the submit/submission contract; `httpApi.ts` implements it against the
  control plane; `mockApi.ts` gets a deterministic stub so the UI runs offline (returns `AC` for a
  non-empty source). Auth/enforcement remain server-side; the mock is UI-only (per CLAUDE.md).

## 7. Testing strategy

- **Judge golden tests** (JUnit, executed live on **JS + Java**, which run in this env): per pilot
  problem, a known-correct solution → `AC`; a known-`O(n²)` solution → `TLE` on the max-stress
  bucket; a known-wrong solution → `WA`. This spans every wire type (scalar/array/list/tree/graph/
  operations) and every checker (exact/unordered/float) across the 7 SP3 bundles. These are the
  judge's integration tests (master spec §9).
- **Driver codegen tests** for **Python + C++** (JUnit string-shape assertions) — the programs are
  generated and asserted structurally but **not executed** (no toolchain), the single explicit
  honesty caveat, consistent with SP3.
- **Checker unit tests**: exact equality, unordered set/multiset (Two Sum indices), float boundary
  at `eps` (Pow(x,n)).
- **Submission persistence**: verdict-aggregation + status-mapping logic unit-tested DB-free;
  actual Postgres persistence is **Testcontainers-gated and not runnable here** (no Docker) — the
  same known unverified surface as SP3's seeder.
- **Frontend**: `api/types` contract + Submit panel state machine unit-tested (Vitest); `mockApi`
  stub keeps the whole-catalogue smoke green. `tsc -b` + `vite build` gate.
- Gates: `./gradlew build` (backend), `npm test` + `npm run build` (frontend).

## 8. Verification constraints in the target environment (honest)

- ✅ Backend compiles (`./gradlew build`); judge golden tests run for **JavaScript and Java**
  end-to-end (compile-once → per-case run → checker → verdict), proving AC/WA/CE for real.
- ✅ **TLE is proven via the enforcement mechanism** — a deliberately slow solution is killed by
  the per-case wall-clock guard and reported `TLE` (deterministic, load-independent). Note: the
  pilot bundles top out at n≈5000, too small for an O(n²) solution to blow a realistic clock, so
  *algorithmic-scale* TLE (O(n²) at the constraint ceiling) needs a larger-n bundle than the pilot
  ships — the generator framework supports it; only the pilot's `n_max` is small. The judge's TLE
  path itself is fully verified.
- ✅ Checker + driver-codegen + verdict-aggregation unit tests run.
- ✅ Frontend `tsc` + `vitest` + `build` green; Submit UX exercised against `mockApi`.
- ⚠️ **Python and C++ drivers are generated and string-asserted but not executed** — g++/python3
  are absent here. Structurally identical to the verified JS/Java drivers; full execution parity
  lands when those toolchains are present.
- ⚠️ **`submissions` Postgres persistence is Testcontainers-gated (no Docker here)** — only the
  DB-free logic is unit-verified this pass. Same single caveat class as SP3.

## 9. Out of scope (deferred)

- Authoring bundles for the other 142 problems (the judge already handles them generically).
- `custom:<checkerId>` checkers (no pilot problem needs one).
- Per-case memory measurement / `MLE` verdict (master spec §11 — best-effort, later).
- S3/MinIO `BundleStore` (SP3 defined the interface; `LocalBundleStore` is the default).
- Real sandbox/container isolation swap-in behind `ProcessManager` (already the documented seam).
- `quad-tree` wire support (deferred with its problem to a later pass).
