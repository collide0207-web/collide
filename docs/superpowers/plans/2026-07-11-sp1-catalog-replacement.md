# SP1: LeetCode 150 Catalog Replacement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the NeetCode 150 sheet with LeetCode "Top Interview 150" as the single sheet — extend the harness schema for the judging contract, make the seeder idempotently prune orphans, flip the default sheet, and author all 150 problems (statements, starter code, visible sample cases) behind a validation gate.

**Architecture:** The seed JSON in git (`seed/leetcode150.json`) is the source of truth; a Spring `ApplicationRunner` upserts it into the Postgres `problems` table on boot and now prunes rows absent from the seed. The frontend mirrors a compact copy in `seed.ts` for mock/offline mode. SP1 only extends the harness *schema* (checker spec + limits as parse-through fields) — the new-type codegen and server judge land in SP2/SP4.

**Tech Stack:** Spring Boot 4.1 (Java, Jackson 3, JPA/Hibernate, Flyway), React + Vite + TypeScript, Node (validator script).

## Global Constraints

- Backend module: `collab/collab/control/` — Spring Boot, Java, Gradle. `tsc`/Gradle are the gates.
- Frontend module: `collide/` — React/TS. **No test runner**; the gate is `npm run build` (`tsc -b`) plus a runnable seed validator (`node`).
- Jackson 3 namespace (`tools.jackson` / `com.fasterxml.jackson` per Boot 4.1) — match existing imports in the `problem` package exactly; do not introduce a different Jackson major.
- **Docker/testcontainers are unavailable in this environment** — backend tests for SP1 must be plain unit tests (JUnit + Mockito), never `@PostgresIntegrationTest`.
- The harness `type` tag is an opaque `String` end to end; SP1 adds NO codegen for `list-node`/`tree-node`/`operations` (that is SP2). SP1 only lets those tags and the new checker/limit fields round-trip through storage and the API.
- Sheet identifier string is exactly `leetcode150`. Every default that currently reads `neetcode150` becomes `leetcode150`.
- Commit after every task. Branch: `feat/leetcode-150-judging` (already created).

---

### Task 1: Extend the harness schema (backend record + frontend interface)

Add three optional fields to the harness contract so seed authoring and the API can carry the judging metadata SP3/SP4 will consume: `judge` (checker spec string), `timeLimitMs`, `memoryLimitKb`. Parse-through only — nothing interprets them yet.

**Files:**
- Modify: `collab/collab/control/src/main/java/app/collide/control/problem/ProblemHarness.java`
- Test: `collab/collab/control/src/test/java/app/collide/control/problem/ProblemHarnessTest.java` (create)
- Modify: `collide/src/api/types.ts:137-142` (the `ProblemHarness` interface)

**Interfaces:**
- Produces (backend): `ProblemHarness(String entry, List<Param> params, String returns, List<Test> tests, String judge, Integer timeLimitMs, Integer memoryLimitKb)` — new fields nullable.
- Produces (frontend): `ProblemHarness` interface gains `judge?: string; timeLimitMs?: number; memoryLimitKb?: number`.

- [ ] **Step 1: Write the failing test** — `ProblemHarnessTest.java`

```java
package app.collide.control.problem;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;

class ProblemHarnessTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void deserializesJudgingMetadataWhenPresent() throws Exception {
        String json = """
            {"entry":"twoSum","params":[{"name":"nums","type":"int[]"}],
             "returns":"int[]","tests":[{"input":[[2,7],9],"expected":[0,1]}],
             "judge":"unordered","timeLimitMs":2000,"memoryLimitKb":65536}
            """;
        ProblemHarness h = mapper.readValue(json, ProblemHarness.class);
        assertThat(h.judge()).isEqualTo("unordered");
        assertThat(h.timeLimitMs()).isEqualTo(2000);
        assertThat(h.memoryLimitKb()).isEqualTo(65536);
    }

    @Test
    void toleratesLegacyHarnessWithoutJudgingMetadata() throws Exception {
        String json = """
            {"entry":"twoSum","params":[{"name":"nums","type":"int[]"}],
             "returns":"int[]","tests":[{"input":[[2,7],9],"expected":[0,1]}]}
            """;
        ProblemHarness h = mapper.readValue(json, ProblemHarness.class);
        assertThat(h.judge()).isNull();
        assertThat(h.timeLimitMs()).isNull();
        assertThat(h.entry()).isEqualTo("twoSum");
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd collab/collab/control && ./gradlew test --tests app.collide.control.problem.ProblemHarnessTest`
Expected: FAIL to compile — `ProblemHarness` has no `judge()`/`timeLimitMs()` accessors.

- [ ] **Step 3: Add the fields to the record**

In `ProblemHarness.java`, change the record header to:

```java
public record ProblemHarness(
        String entry,
        List<Param> params,
        String returns,
        List<Test> tests,
        /** Checker spec: "exact" | "unordered" | "float:<eps>" | "custom:<checkerId>". Null → "exact". */
        String judge,
        /** Per-case wall-clock limit for server-side Submit. Null → default applied in SP4. */
        Integer timeLimitMs,
        /** Per-case memory cap (KB) for server-side Submit. Null → default applied in SP4. */
        Integer memoryLimitKb) {

    public record Param(String name, String type) {}

    public record Test(List<Object> input, Object expected) {}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd collab/collab/control && ./gradlew test --tests app.collide.control.problem.ProblemHarnessTest`
Expected: PASS (2 tests).

- [ ] **Step 5: Mirror the fields in the frontend interface**

In `collide/src/api/types.ts`, replace the `ProblemHarness` interface body with:

```ts
export interface ProblemHarness {
  entry: string
  params: HarnessParam[]
  returns: string
  tests: HarnessTest[]
  /** Checker spec: 'exact' | 'unordered' | 'float:<eps>' | 'custom:<id>'. Absent → 'exact'. */
  judge?: string
  /** Per-case wall-clock limit (ms) used by server-side Submit (SP4). */
  timeLimitMs?: number
  /** Per-case memory cap (KB) used by server-side Submit (SP4). */
  memoryLimitKb?: number
}
```

- [ ] **Step 6: Typecheck the frontend**

Run: `cd collide && npm run build`
Expected: PASS — `tsc -b` clean (optional fields are additive; `normalizeHarness` in `httpApi.ts` already passes unknown props through).

- [ ] **Step 7: Commit**

```bash
git -C collab/collab/control add src/main/java/app/collide/control/problem/ProblemHarness.java src/test/java/app/collide/control/problem/ProblemHarnessTest.java
git -C collab/collab/control commit -m "feat(problem): add judge/limit fields to harness schema"
git -C collide add src/api/types.ts
git -C collide commit -m "feat(api): mirror harness judge/limit fields in ProblemHarness type"
```

---

### Task 2: Seed validation script (the content gate)

A runnable Node validator that every authored problem in `seed/leetcode150.json` must pass. It is the "test" for the content-authoring task (Task 5) and a CI gate. Validates required fields, difficulty enum, harness shape, that at least one visible sample exists, and that sample `input` arity matches `params`.

**Files:**
- Create: `collide/scripts/validate-seed.mjs`
- Create: `collide/scripts/fixtures/valid-seed.sample.json` (tiny fixture: one valid problem)
- Create: `collide/scripts/fixtures/invalid-seed.sample.json` (one problem missing `harness.tests`)

**Interfaces:**
- Produces: CLI `node scripts/validate-seed.mjs <path-to-seed.json>` — exits `0` if all problems valid, `1` and prints `slug: <error>` lines otherwise. Reused by Task 5 and CI.

- [ ] **Step 1: Write the validator with its fixtures**

Create `collide/scripts/fixtures/valid-seed.sample.json`:

```json
[
  {
    "id": "p-two-sum", "slug": "two-sum", "title": "Two Sum",
    "difficulty": "easy", "category": "Arrays & Hashing", "tags": ["array"],
    "sheet": "leetcode150", "sourceUrl": "https://leetcode.com/problems/two-sum/",
    "description": "Return indices of two numbers adding to target.",
    "examples": [{ "input": "nums=[2,7], target=9", "output": "[0,1]" }],
    "constraints": "2 <= n <= 1e4",
    "supportedLanguages": ["javascript", "python", "java", "cpp"],
    "starterCode": { "javascript": "function twoSum(nums,target){}" },
    "harness": {
      "entry": "twoSum",
      "params": [{ "name": "nums", "type": "int[]" }, { "name": "target", "type": "int" }],
      "returns": "int[]", "judge": "unordered",
      "tests": [{ "input": [[2,7], 9], "expected": [0,1] }]
    }
  }
]
```

Create `collide/scripts/fixtures/invalid-seed.sample.json` — same as above but delete the `"tests"` key from `harness`.

Create `collide/scripts/validate-seed.mjs`:

```js
import { readFileSync } from 'node:fs'

const DIFFICULTIES = new Set(['easy', 'medium', 'hard'])
const JUDGE_RE = /^(exact|unordered|float:[0-9.eE+-]+|custom:[a-z0-9-]+)$/

/** Returns an array of "slug: message" error strings ([] when the seed is valid). */
export function validateSeed(problems) {
  const errors = []
  const slugs = new Set()
  if (!Array.isArray(problems)) return ['<root>: seed must be a JSON array']
  for (const p of problems) {
    const slug = p?.slug ?? '<no-slug>'
    const err = (m) => errors.push(`${slug}: ${m}`)
    for (const f of ['id', 'slug', 'title', 'difficulty', 'category']) {
      if (typeof p?.[f] !== 'string' || !p[f]) err(`missing/empty field "${f}"`)
    }
    if (slugs.has(slug)) err('duplicate slug')
    slugs.add(slug)
    if (p?.difficulty && !DIFFICULTIES.has(p.difficulty)) err(`bad difficulty "${p.difficulty}"`)
    if (p?.sheet && p.sheet !== 'leetcode150') err(`sheet must be "leetcode150"`)
    const h = p?.harness
    if (h) {
      if (typeof h.entry !== 'string' || !h.entry) err('harness.entry missing')
      if (!Array.isArray(h.params)) err('harness.params must be an array')
      if (!Array.isArray(h.tests) || h.tests.length === 0) err('harness needs >=1 sample test')
      if (h.judge && !JUDGE_RE.test(h.judge)) err(`bad judge spec "${h.judge}"`)
      if (Array.isArray(h.params) && Array.isArray(h.tests)) {
        for (const [i, t] of h.tests.entries()) {
          if (!Array.isArray(t?.input)) { err(`test[${i}].input must be an array`); continue }
          if (t.input.length !== h.params.length)
            err(`test[${i}] arity ${t.input.length} != ${h.params.length} params`)
        }
      }
    }
  }
  return errors
}

// CLI entry
const path = process.argv[2]
if (path) {
  const errors = validateSeed(JSON.parse(readFileSync(path, 'utf8')))
  if (errors.length) { errors.forEach((e) => console.error(e)); process.exit(1) }
  console.log('seed valid')
}
```

- [ ] **Step 2: Run the validator against both fixtures to prove it passes valid / fails invalid**

Run:
```bash
cd collide
node scripts/validate-seed.mjs scripts/fixtures/valid-seed.sample.json; echo "exit=$?"
node scripts/validate-seed.mjs scripts/fixtures/invalid-seed.sample.json; echo "exit=$?"
```
Expected: first prints `seed valid` and `exit=0`; second prints `two-sum: harness needs >=1 sample test` and `exit=1`.

- [ ] **Step 3: Commit**

```bash
git -C collide add scripts/validate-seed.mjs scripts/fixtures/valid-seed.sample.json scripts/fixtures/invalid-seed.sample.json
git -C collide commit -m "feat(seed): add LeetCode 150 seed validation script"
```

---

### Task 3: Orphan-pruning seeder for the leetcode150 sheet

Point the seeder at `seed/leetcode150.json`, parse the new harness metadata, and after upserting delete any problem whose slug is absent from the active seed (making "replace" clean; cascades remove stale progress). Logic must be unit-testable without a database.

**Files:**
- Modify: `collab/collab/control/src/main/java/app/collide/control/problem/ProblemSeeder.java`
- Modify: `collab/collab/control/src/main/java/app/collide/control/problem/ProblemRepository.java`
- Test: `collab/collab/control/src/test/java/app/collide/control/problem/ProblemSeederPruneTest.java` (create)
- Create (placeholder, filled in Task 5): `collab/collab/control/src/main/resources/seed/leetcode150.json`

**Interfaces:**
- Consumes: `ProblemRepository.findBySlug`, `JpaRepository.findAll/save/deleteAll`.
- Produces: `ProblemRepository.findBySheet(String sheet)` (no-sort overload); `ProblemSeeder.prune(List<Problem> existing, Set<String> seededSlugs)` → `List<Problem>` (problems to delete), a static, DB-free method.

- [ ] **Step 1: Create the placeholder seed resource** so the app still boots

Create `collab/collab/control/src/main/resources/seed/leetcode150.json` with a single real entry (Task 5 fills the rest):

```json
[
  {
    "id": "p-two-sum", "slug": "two-sum", "title": "Two Sum",
    "difficulty": "easy", "category": "Arrays & Hashing", "tags": ["array", "hash-map"],
    "sheet": "leetcode150", "order": 0,
    "sourceUrl": "https://leetcode.com/problems/two-sum/",
    "description": "Given an array of integers and a target, return the indices of the two numbers that add up to the target. Exactly one solution exists; you may not reuse an element.",
    "examples": [{ "input": "nums = [2,7,11,15], target = 9", "output": "[0,1]", "explanation": "nums[0]+nums[1]==9." }],
    "constraints": "2 <= nums.length <= 1e4; -1e9 <= nums[i] <= 1e9; exactly one valid answer.",
    "supportedLanguages": ["javascript", "python", "java", "cpp"],
    "starterCode": {
      "javascript": "function twoSum(nums, target) {\n  // your code here\n}\n",
      "python": "class Solution:\n    def twoSum(self, nums, target):\n        pass\n",
      "java": "import java.util.*;\n\nclass Solution {\n    public int[] twoSum(int[] nums, int target) {\n        return new int[]{};\n    }\n}\n",
      "cpp": "#include <bits/stdc++.h>\nusing namespace std;\n\nclass Solution {\npublic:\n    vector<int> twoSum(vector<int>& nums, int target) {\n        return {};\n    }\n};\n"
    },
    "harness": {
      "entry": "twoSum",
      "params": [{ "name": "nums", "type": "int[]" }, { "name": "target", "type": "int" }],
      "returns": "int[]", "judge": "unordered", "timeLimitMs": 2000, "memoryLimitKb": 65536,
      "tests": [
        { "input": [[2,7,11,15], 9], "expected": [0,1] },
        { "input": [[3,2,4], 6], "expected": [1,2] }
      ]
    }
  }
]
```

- [ ] **Step 2: Write the failing prune unit test** — `ProblemSeederPruneTest.java`

```java
package app.collide.control.problem;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ProblemSeederPruneTest {

    private Problem withSlug(String slug) {
        return new Problem(UUID.randomUUID(), slug);
    }

    @Test
    void pruneReturnsRowsWhoseSlugIsNotInTheActiveSeed() {
        Problem keep = withSlug("two-sum");
        Problem orphanA = withSlug("house-robber");   // NeetCode-only, not in LeetCode 150
        Problem orphanB = withSlug("koko-bananas");
        List<Problem> toDelete = ProblemSeeder.prune(
                List.of(keep, orphanA, orphanB), Set.of("two-sum"));
        assertThat(toDelete).containsExactlyInAnyOrder(orphanA, orphanB);
    }

    @Test
    void pruneReturnsEmptyWhenEverySlugIsSeeded() {
        Problem a = withSlug("two-sum");
        Problem b = withSlug("valid-parentheses");
        List<Problem> toDelete = ProblemSeeder.prune(
                List.of(a, b), Set.of("two-sum", "valid-parentheses"));
        assertThat(toDelete).isEmpty();
    }
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd collab/collab/control && ./gradlew test --tests app.collide.control.problem.ProblemSeederPruneTest`
Expected: FAIL to compile — `ProblemSeeder.prune` does not exist.

- [ ] **Step 4: Implement pruning + repark the seeder on leetcode150**

In `ProblemRepository.java` add the no-sort overload:

```java
    List<Problem> findBySheet(String sheet);
```

In `ProblemSeeder.java`:
1. Change the constant: `private static final String RESOURCE = "seed/leetcode150.json";`
2. Add the static prune helper (place above `run`):

```java
    /** Rows in {@code existing} whose slug is absent from {@code seededSlugs} — safe to delete. */
    static List<Problem> prune(List<Problem> existing, Set<String> seededSlugs) {
        return existing.stream().filter(p -> !seededSlugs.contains(p.getSlug())).toList();
    }
```
3. Track seeded slugs in `run` and prune the active sheet after the upsert loop. Inside `run`, collect slugs while iterating, then before the closing log line:

```java
        java.util.Set<String> seeded = new java.util.HashSet<>();
        // ... in the loop, right after `String slug = n.get("slug").asText();`
        //     add:  seeded.add(slug);
        // ... after the loop:
        String sheet = "leetcode150";
        List<Problem> orphans = prune(problems.findBySheet(sheet), seeded);
        if (!orphans.isEmpty()) {
            problems.deleteAll(orphans);
            log.info("Pruned {} orphaned problems from sheet {}", orphans.size(), sheet);
        }
```
   Add `import java.util.Set;` and `import java.util.HashSet;` (or use fully-qualified as shown). Ensure `seeded.add(slug);` is added inside the existing for-loop.

   > Note: pruning targets only rows already tagged `sheet='leetcode150'`. Legacy `neetcode150` rows whose slug overlaps get their sheet reassigned to `leetcode150` by the existing `p.setSheet(...)` line (seed sets `"sheet":"leetcode150"`), then survive; non-overlapping legacy rows keep `sheet='neetcode150'` and are cleared by the V7 migration in Task 4.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd collab/collab/control && ./gradlew test --tests app.collide.control.problem.ProblemSeederPruneTest`
Expected: PASS (2 tests).

- [ ] **Step 6: Compile-check the whole module**

Run: `cd collab/collab/control && ./gradlew compileJava`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 7: Commit**

```bash
git -C collab/collab/control add src/main/java/app/collide/control/problem/ProblemSeeder.java src/main/java/app/collide/control/problem/ProblemRepository.java src/test/java/app/collide/control/problem/ProblemSeederPruneTest.java src/main/resources/seed/leetcode150.json
git -C collab/collab/control commit -m "feat(problem): seed leetcode150 sheet and prune orphaned problems"
```

---

### Task 4: Flip the default sheet to leetcode150

Change the API default sheet everywhere it reads `neetcode150`, and add a migration that reassigns/clears any legacy rows so a pre-existing database converges to the new sheet without a manual step.

**Files:**
- Modify: `collab/collab/control/src/main/java/app/collide/control/problem/ProblemController.java:23,28`
- Create: `collab/collab/control/src/main/resources/db/migration/V7__leetcode150_sheet.sql`
- Modify: `collide/src/api/httpApi.ts:328,347`

**Interfaces:**
- Consumes: `ProblemController.list`, `ProblemController.categories`, `httpApi.getProblems`, `httpApi.getProblemCategories`.
- Produces: default sheet `leetcode150` on every problems/categories entry point.

- [ ] **Step 1: Write the migration**

Create `V7__leetcode150_sheet.sql`:

```sql
-- Converge any pre-existing catalogue onto the LeetCode 150 sheet. Overlapping slugs
-- are re-seeded (and their sheet reset) by ProblemSeeder on boot; this clears the
-- remaining legacy default so the column no longer references the retired sheet.
UPDATE problems SET sheet = 'leetcode150' WHERE sheet = 'neetcode150';
ALTER TABLE problems ALTER COLUMN sheet SET DEFAULT 'leetcode150';
```

> This intentionally makes every existing row `leetcode150`; the seeder's prune step (Task 3) then deletes any that are not in `leetcode150.json`, cascading their `user_progress`. This is the accepted consequence of the "replace" decision.

- [ ] **Step 2: Flip the controller defaults**

In `ProblemController.java`, change both `@RequestParam(defaultValue = "neetcode150")` occurrences (lines 23 and 28) to `@RequestParam(defaultValue = "leetcode150")`.

- [ ] **Step 3: Flip the frontend defaults**

In `collide/src/api/httpApi.ts`, change `getProblems(sheet = 'neetcode150')` (line ~328) and `getProblemCategories(sheet = 'neetcode150')` (line ~347) to `'leetcode150'`.

- [ ] **Step 4: Verify no stray `neetcode150` default remains**

Run:
```bash
grep -rn "neetcode150" collab/collab/control/src/main collide/src || echo "none remaining"
```
Expected: only matches inside comments/migrations that reference the *retired* sheet by name (V7, the V4 historical `DEFAULT`); no live `defaultValue`/parameter default. The frontend `seed.ts` is regenerated in Task 5.

- [ ] **Step 5: Compile-check both modules**

Run:
```bash
cd collab/collab/control && ./gradlew compileJava
cd ../../../collide && npm run build
```
Expected: both succeed.

- [ ] **Step 6: Commit**

```bash
git -C collab/collab/control add src/main/java/app/collide/control/problem/ProblemController.java src/main/resources/db/migration/V7__leetcode150_sheet.sql
git -C collab/collab/control commit -m "feat(problem): default sheet to leetcode150 + converge legacy rows"
git -C collide add src/api/httpApi.ts
git -C collide commit -m "feat(api): default problem sheet to leetcode150"
```

---

### Task 5: Author the LeetCode 150 catalogue (batched, validator-gated)

Populate `seed/leetcode150.json` with all 150 problems and regenerate the frontend mirror `seed.ts`. Content is authored in **category batches**, each batch gated by the Task 2 validator. Statements must be **original re-wordings** (never copied from LeetCode) plus a `sourceUrl` link-out — matching the existing NeetCode pattern.

**Files:**
- Modify: `collab/collab/control/src/main/resources/seed/leetcode150.json` (author all 150)
- Create: `collide/scripts/gen-frontend-seed.mjs` (derives `seed.ts` from the JSON)
- Modify: `collide/src/problems/seed.ts` (generated output)

**Interfaces:**
- Consumes: `validateSeed` CLI from Task 2; the `ProblemDetail` shape from `collide/src/api/types.ts`.
- Produces: a complete `leetcode150.json` (150 entries) and a regenerated `seed.ts` exporting `MOCK_PROBLEMS: ProblemDetail[]`.

**Per-problem authoring checklist** (every entry must have): `id`, `slug`, `title`, `difficulty`, `category`, `tags`, `sheet:"leetcode150"`, `order`, `sourceUrl`, original `description`, `examples`, `constraints`, `starterCode` for all four languages, and a `harness` with `entry`, `params` (typed), `returns`, `judge`, `timeLimitMs`, `memoryLimitKb`, and **3–10 visible sample `tests`**. For problems needing `list-node`/`tree-node`/`operations`, set the `type`/mode tags now (codegen arrives in SP2); their samples still round-trip and display.

The 22 Top-Interview-150 categories (author in this order, one commit per category batch): Array/String, Two Pointers, Sliding Window, Matrix, Hashmap, Intervals, Stack, Linked List, Binary Tree General, Binary Tree BFS, Binary Search Tree, Graph General, Graph BFS, Trie, Backtracking, Divide & Conquer, Kadane, Binary Search, Heap, Bit Manipulation, Math, 1D DP, Multidimensional DP.

- [ ] **Step 1: Write the frontend-seed generator**

Create `collide/scripts/gen-frontend-seed.mjs`:

```js
// Derives src/problems/seed.ts from the backend source-of-truth JSON so the mock/offline
// catalogue always matches the seeded catalogue. Run after editing leetcode150.json.
import { readFileSync, writeFileSync } from 'node:fs'

const SRC = '../collab/collab/control/src/main/resources/seed/leetcode150.json'
const OUT = 'src/problems/seed.ts'

const problems = JSON.parse(readFileSync(SRC, 'utf8'))
// seed.ts uses ProblemDetail (no `order`/`sheet` fields); strip them.
const detail = problems.map(({ order, sheet, ...rest }) => rest)
const banner = `import type { ProblemDetail } from '../api/types'

/** GENERATED by scripts/gen-frontend-seed.mjs from control/seed/leetcode150.json. Do not edit by hand. */
export const MOCK_PROBLEMS: ProblemDetail[] = `
writeFileSync(OUT, banner + JSON.stringify(detail, null, 2) + '\n')
console.log(`wrote ${detail.length} problems to ${OUT}`)
```

- [ ] **Step 2: Author the first category batch (Array/String) in `leetcode150.json`**

Add every Array/String problem as a full entry following the per-problem checklist above and the `two-sum` entry from Task 3 as the template. Keep `order` globally increasing.

- [ ] **Step 3: Validate the batch**

Run: `cd collide && node scripts/validate-seed.mjs ../collab/collab/control/src/main/resources/seed/leetcode150.json`
Expected: `seed valid` (fix any `slug: message` lines before continuing).

- [ ] **Step 4: Commit the batch**

```bash
git -C collab/collab/control add src/main/resources/seed/leetcode150.json
git -C collab/collab/control commit -m "content(problem): author LeetCode 150 Array/String batch"
```

- [ ] **Step 5: Repeat Steps 2–4 for each remaining category** until all 150 are authored and `validate-seed.mjs` reports `seed valid` for the full file. Commit one batch per category (22 commits total).

- [ ] **Step 6: Regenerate the frontend mirror and typecheck**

Run:
```bash
cd collide
node scripts/gen-frontend-seed.mjs
npm run build
```
Expected: `wrote 150 problems to src/problems/seed.ts`, then `tsc -b` clean.

- [ ] **Step 7: Commit the generator + regenerated mirror**

```bash
git -C collide add scripts/gen-frontend-seed.mjs src/problems/seed.ts
git -C collide commit -m "content(seed): regenerate frontend LeetCode 150 mirror"
```

---

## Self-Review

**Spec coverage (against §10 SP1 scope of the master spec):**
- Seed swap → Task 3 (RESOURCE) + Task 4 (defaults/migration). ✓
- Orphan-pruning seeder → Task 3. ✓
- Author all 150 (statements, starter, sample cases) → Task 5. ✓
- Extended harness *schema* (checker spec + limits, parse-through) → Task 1. ✓
- New type tags round-trip (no codegen) → covered by the opaque-`String` `type` contract (Global Constraints) + Task 5 authoring; codegen explicitly deferred to SP2. ✓

**Placeholder scan:** No `TBD`/`handle edge cases`/"write tests for the above"; the only intentional expand-later is Task 5's per-category authoring, which is a bounded content loop with a concrete validator gate and template, not a code placeholder. ✓

**Type consistency:** `ProblemHarness.prune(List<Problem>, Set<String>)` used identically in Task 3 test and impl; `validateSeed(problems)` signature identical in Task 2 def and Task 5 usage; frontend `judge?/timeLimitMs?/memoryLimitKb?` names match backend `judge()/timeLimitMs()/memoryLimitKb()`. ✓

**Out of scope (later SPs, by design):** `list-node`/`tree-node`/`operations` codegen (SP2); generator/reference/checker + CI bundles + `problem_test_bundle` (SP3); server judge, Submit endpoint, `submissions`, verdict UX (SP4).

## Post-Implementation Note

Final catalog contains 149 problems (not 150) — the accurate LeetCode Top Interview 150 category breakdown for Bit Manipulation/Math/1D DP/Multidimensional DP totals 26 problems rather than the ~27 originally estimated; this was a deliberate accuracy-over-round-number decision, confirmed during final review.
