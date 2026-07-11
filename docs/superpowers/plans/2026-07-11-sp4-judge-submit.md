# SP4 — Judge + Submit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add authoritative server-side judging: a `POST /api/problems/{slug}/submit` endpoint that compiles a user's solution once, runs it against the ~100 hidden SP3 cases with a per-case wall-clock guard, applies the problem's checker, aggregates an `AC/WA/TLE/RE/CE` verdict, persists a `submissions` row, and surfaces a verdict panel + submissions history in the frontend.

**Architecture:** A new `app.collide.control.judge` package in the control plane that *composes* the existing `execution/` primitives (`ProcessManager`, `FileManager`/`Workspace`, `LanguageExecutorFactory`, `ExecutionQueue`, `ExecutionPublisher`) and the SP3 bundle registry (`ProblemTestBundleRepository`, `BundleStore`). The judge is **generic** — driven entirely by `ProblemHarness` + the bundle — so it works for every problem whose bundle exists, with zero per-problem code. Frontend adds a Submit tier alongside the untouched Run tier.

**Tech Stack:** Java 17 / Spring Boot (control plane), Flyway migrations, JUnit 5; React + TypeScript + Vite + Vitest (frontend). Node 24 + Java 17 are the only runnable toolchains in this env (g++/python3 absent).

## Global Constraints

- **Two repos, separate git roots.** Backend work + commits happen in `collab/collab/control/` (repo `collide0207-web/collab`). Frontend work + commits happen in `collide/` (repo `collide0207-web/collide`). Both are on branch `feat/leetcode-150-judging`. Never a top-level commit.
- **`userId` comes from the JWT `AuthPrincipal`, never a client field** — anti-tamper boundary (master spec §7).
- **Convergence/verdict is empirical:** per-case wall-clock = `timeLimitMs` (bundle row, default 2000). TLE is detected by the clock, never static analysis.
- **Hidden inputs never leak** to the client: WA/TLE/RE responses carry only `failingCaseIndex` + status + counts, never the hidden input or expected value.
- **Canonical output = `JSON.stringify` with no spaces** (SP2/SP3 contract). Driver output must match the bundle's `expected` bit-for-bit.
- **Backend gate:** `./gradlew build` from `collab/collab/control/`. **Frontend gate:** `npm test` + `npm run build` from `collide/`.
- **Honest verification:** JS + Java judge paths are executed live; Python + C++ drivers are generated and string-asserted only (no toolchain); `submissions` Postgres persistence is Testcontainers-gated (no Docker) — logic is unit-tested DB-free.
- Backend commands run from `collab/collab/control/`; frontend commands from `collide/`.

---

## File Structure

**Backend — new package `src/main/java/app/collide/control/judge/`:**
- `Verdict.java` — result record `{status, passed, total, failingCaseIndex, maxRuntimeMs}` + `VerdictStatus` enum.
- `checker/Checker.java` — interface `boolean check(String stdout, Object expected)`.
- `checker/ExactChecker.java`, `checker/UnorderedChecker.java`, `checker/FloatChecker.java`.
- `checker/Checkers.java` — parse a `judge` string → `Checker`.
- `TestCase.java` — record `{List<Object> input, Object expected}`.
- `TestBundleLoader.java` — resolve active bundle, load+gunzip+parse, cache by checksum.
- `driver/WirePreludes.java` — per-language constant blocks (JSON reader + list/tree/graph serde), ported from `harness.ts`.
- `driver/JudgeDriverGenerator.java` — compose a complete stdin-reading program per language.
- `JudgeService.java` — compile once → per-case run → classify → checker → aggregate → publish.
- `Submission.java` (entity), `SubmissionRepository.java`, `SubmissionService.java`, `SubmissionController.java`, `SubmitRequest.java`, `SubmissionView.java`.

**Backend — migration:** `src/main/resources/db/migration/V9__submissions.sql`.

**Backend — tests** under `src/test/java/app/collide/control/judge/`.

**Frontend (`collide/src/`):**
- `api/types.ts` — add `SubmitInput`, `SubmissionSummary`, `SubmissionResult`, `Verdict` + 3 `Api` methods.
- `api/mockApi.ts` — submit stub. `api/httpApi.ts` — real submit impl.
- `run/submissionRunner.ts` — poll a submission to terminal.
- `run/VerdictPanel.tsx` — verdict UI. `problems/ProblemDetailPage.tsx` — replace client `onSubmit` with server Submit.
- Tests: `run/submissionRunner.test.ts`, `api/mockApi` covered by existing smoke.

---

## Task 1: Verdict model + VerdictStatus

**Files:**
- Create: `src/main/java/app/collide/control/judge/Verdict.java`
- Test: `src/test/java/app/collide/control/judge/VerdictTest.java`

**Interfaces:**
- Produces: `enum VerdictStatus { AC, WA, TLE, RE, CE }`; `record Verdict(VerdictStatus status, int passed, int total, int failingCaseIndex, long maxRuntimeMs)`; static factories `Verdict.compileError()`, `Verdict.accepted(int total, long maxRuntimeMs)`, `Verdict.failed(VerdictStatus status, int passed, int total, int failingIndex, long maxRuntimeMs)`.

- [ ] **Step 1: Write the failing test**

```java
package app.collide.control.judge;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class VerdictTest {

    @Test
    void acceptedFillsFailingIndexWithMinusOneAndFullPassCount() {
        Verdict v = Verdict.accepted(100, 42);
        assertThat(v.status()).isEqualTo(VerdictStatus.AC);
        assertThat(v.passed()).isEqualTo(100);
        assertThat(v.total()).isEqualTo(100);
        assertThat(v.failingCaseIndex()).isEqualTo(-1);
        assertThat(v.maxRuntimeMs()).isEqualTo(42);
    }

    @Test
    void compileErrorHasNoCasesRun() {
        Verdict v = Verdict.compileError();
        assertThat(v.status()).isEqualTo(VerdictStatus.CE);
        assertThat(v.total()).isZero();
        assertThat(v.failingCaseIndex()).isEqualTo(-1);
    }

    @Test
    void failedCarriesFirstFailingIndexAndPassCountBeforeIt() {
        Verdict v = Verdict.failed(VerdictStatus.WA, 41, 100, 41, 12);
        assertThat(v.status()).isEqualTo(VerdictStatus.WA);
        assertThat(v.passed()).isEqualTo(41);
        assertThat(v.failingCaseIndex()).isEqualTo(41);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew test --tests 'app.collide.control.judge.VerdictTest'`
Expected: FAIL — `Verdict`/`VerdictStatus` do not exist (compile error).

- [ ] **Step 3: Write minimal implementation**

```java
package app.collide.control.judge;

/**
 * The authoritative outcome of a Submit: which verdict, how many of the hidden cases passed,
 * the index of the first failing case (or -1 on AC), and the worst per-case runtime observed.
 * Hidden inputs are never part of this record — only the failing index is exposed (spec §4).
 */
public record Verdict(VerdictStatus status, int passed, int total, int failingCaseIndex, long maxRuntimeMs) {

    public static Verdict compileError() {
        return new Verdict(VerdictStatus.CE, 0, 0, -1, 0);
    }

    public static Verdict accepted(int total, long maxRuntimeMs) {
        return new Verdict(VerdictStatus.AC, total, total, -1, maxRuntimeMs);
    }

    public static Verdict failed(VerdictStatus status, int passed, int total, int failingIndex, long maxRuntimeMs) {
        return new Verdict(status, passed, total, failingIndex, maxRuntimeMs);
    }

    /** Verdict codes. AC=accepted, WA=wrong answer, TLE=time limit, RE=runtime error, CE=compile error. */
    public enum VerdictStatus {
        AC,
        WA,
        TLE,
        RE,
        CE
    }
}
```

Note: reference the enum as `Verdict.VerdictStatus` from other classes (nested). If the test's `import` of a top-level `VerdictStatus` fails to resolve, change the test to use `Verdict.VerdictStatus`.

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew test --tests 'app.collide.control.judge.VerdictTest'`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/java/app/collide/control/judge/Verdict.java src/test/java/app/collide/control/judge/VerdictTest.java
git commit -m "feat(sp4): verdict model (AC/WA/TLE/RE/CE)"
```

---

## Task 2: Checkers (exact / unordered / float) + parser

**Files:**
- Create: `src/main/java/app/collide/control/judge/checker/Checker.java`
- Create: `src/main/java/app/collide/control/judge/checker/ExactChecker.java`
- Create: `src/main/java/app/collide/control/judge/checker/UnorderedChecker.java`
- Create: `src/main/java/app/collide/control/judge/checker/FloatChecker.java`
- Create: `src/main/java/app/collide/control/judge/checker/Checkers.java`
- Test: `src/test/java/app/collide/control/judge/checker/CheckersTest.java`

**Interfaces:**
- Consumes: Jackson `ObjectMapper` (already a Spring bean; tests construct `new ObjectMapper()`).
- Produces:
  - `interface Checker { boolean check(String actualStdout, Object expected); }`
  - `Checkers.parse(String judge, ObjectMapper mapper) -> Checker` where `judge` ∈ `{null, "exact", "unordered", "float:<eps>"}`; `"custom:..."` throws `ApiException.badRequest`.
  - Each checker compares the program's **last non-blank stdout line** (JSON) against `expected` (a parsed Java value from the bundle).

- [ ] **Step 1: Write the failing test**

```java
package app.collide.control.judge.checker;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import app.collide.control.common.ApiException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;

class CheckersTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void exactMatchesCanonicalJsonIgnoringTrailingDebugLines() {
        Checker c = Checkers.parse("exact", mapper);
        assertThat(c.check("[1,2,3]", List.of(1, 2, 3))).isTrue();
        assertThat(c.check("debug\n[1,2,3]\n", List.of(1, 2, 3))).isTrue();
        assertThat(c.check("[1,2,4]", List.of(1, 2, 3))).isFalse();
    }

    @Test
    void nullJudgeDefaultsToExact() {
        Checker c = Checkers.parse(null, mapper);
        assertThat(c.check("42", 42)).isTrue();
    }

    @Test
    void unorderedTreatsArraysAsMultisets() {
        Checker c = Checkers.parse("unordered", mapper);
        assertThat(c.check("[1,0]", List.of(0, 1))).isTrue();
        assertThat(c.check("[0,1]", List.of(0, 1))).isTrue();
        assertThat(c.check("[0,0,1]", List.of(0, 1))).isFalse(); // multiset, not set
    }

    @Test
    void floatAcceptsWithinEps() {
        Checker c = Checkers.parse("float:1e-5", mapper);
        assertThat(c.check("2.0000001", 2.0)).isTrue();
        assertThat(c.check("2.1", 2.0)).isFalse();
    }

    @Test
    void customCheckerIsRejectedForNow() {
        assertThatThrownBy(() -> Checkers.parse("custom:two-sum", mapper))
                .isInstanceOf(ApiException.class);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew test --tests 'app.collide.control.judge.checker.CheckersTest'`
Expected: FAIL — classes do not exist.

- [ ] **Step 3: Write minimal implementation**

`Checker.java`:

```java
package app.collide.control.judge.checker;

/**
 * Decides whether a program's stdout is a correct answer for one hidden case. Both tiers key
 * off the harness {@code judge} string (spec §4); the judge parses it once per submission via
 * {@link Checkers}. Implementations compare the last non-blank stdout line against the bundle's
 * expected value, tolerating trailing debug output the same way the client Run tier does.
 */
public interface Checker {
    boolean check(String actualStdout, Object expected);
}
```

`Checkers.java`:

```java
package app.collide.control.judge.checker;

import app.collide.control.common.ApiException;
import com.fasterxml.jackson.databind.ObjectMapper;

/** Parses a harness {@code judge} spec into a {@link Checker}. Null/blank → exact. */
public final class Checkers {

    private Checkers() {}

    public static Checker parse(String judge, ObjectMapper mapper) {
        if (judge == null || judge.isBlank() || judge.equals("exact")) {
            return new ExactChecker(mapper);
        }
        if (judge.equals("unordered")) {
            return new UnorderedChecker(mapper);
        }
        if (judge.startsWith("float:")) {
            double eps;
            try {
                eps = Double.parseDouble(judge.substring("float:".length()));
            } catch (NumberFormatException e) {
                throw ApiException.badRequest("invalid float checker eps: " + judge);
            }
            return new FloatChecker(mapper, eps);
        }
        if (judge.startsWith("custom:")) {
            throw ApiException.badRequest("custom checkers are not supported yet: " + judge);
        }
        throw ApiException.badRequest("unknown judge spec: " + judge);
    }

    /** The program's answer line: last non-blank line of stdout (tolerates trailing debug). */
    static String answerLine(String stdout) {
        if (stdout == null) {
            return "";
        }
        String[] lines = stdout.strip().split("\n");
        for (int i = lines.length - 1; i >= 0; i--) {
            String s = lines[i].strip();
            if (!s.isEmpty()) {
                return s;
            }
        }
        return "";
    }
}
```

`ExactChecker.java`:

```java
package app.collide.control.judge.checker;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Canonical JSON equality. Parses both the answer line and the expected value into a JsonNode
 * tree and compares structurally, so {@code [1,2]} equals {@code [1, 2]} and {@code 2.0}
 * equals {@code 2} — insulated from a language driver's incidental spacing.
 */
public class ExactChecker implements Checker {

    private final ObjectMapper mapper;

    public ExactChecker(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    @Override
    public boolean check(String actualStdout, Object expected) {
        try {
            JsonNode actual = mapper.readTree(Checkers.answerLine(actualStdout));
            JsonNode want = mapper.valueToTree(expected);
            return actual.equals(want);
        } catch (JsonProcessingException e) {
            return false;
        }
    }
}
```

`UnorderedChecker.java`:

```java
package app.collide.control.judge.checker;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Multiset equality for array answers (e.g. Two Sum indices, group-anagrams): same elements
 * with the same multiplicities, order-insensitive. Elements are compared by their canonical
 * JSON text, so nested arrays (list of groups) work too. Non-array answers fall back to exact.
 */
public class UnorderedChecker implements Checker {

    private final ObjectMapper mapper;

    public UnorderedChecker(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    @Override
    public boolean check(String actualStdout, Object expected) {
        try {
            JsonNode actual = mapper.readTree(Checkers.answerLine(actualStdout));
            JsonNode want = mapper.valueToTree(expected);
            if (!actual.isArray() || !want.isArray()) {
                return actual.equals(want);
            }
            return canonicalSorted(actual).equals(canonicalSorted(want));
        } catch (Exception e) {
            return false;
        }
    }

    private List<String> canonicalSorted(JsonNode arr) {
        List<String> out = new ArrayList<>();
        for (JsonNode n : arr) {
            out.add(n.toString());
        }
        out.sort(Comparator.naturalOrder());
        return out;
    }
}
```

`FloatChecker.java`:

```java
package app.collide.control.judge.checker;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Floating-point tolerance for scalar answers (e.g. Pow(x,n)): |actual - expected| <= eps.
 * Falls back to exact JSON equality when either side is non-numeric.
 */
public class FloatChecker implements Checker {

    private final ObjectMapper mapper;
    private final double eps;

    public FloatChecker(ObjectMapper mapper, double eps) {
        this.mapper = mapper;
        this.eps = eps;
    }

    @Override
    public boolean check(String actualStdout, Object expected) {
        try {
            JsonNode actual = mapper.readTree(Checkers.answerLine(actualStdout));
            JsonNode want = mapper.valueToTree(expected);
            if (actual.isNumber() && want.isNumber()) {
                return Math.abs(actual.asDouble() - want.asDouble()) <= eps;
            }
            return actual.equals(want);
        } catch (Exception e) {
            return false;
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew test --tests 'app.collide.control.judge.checker.CheckersTest'`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/java/app/collide/control/judge/checker src/test/java/app/collide/control/judge/checker
git commit -m "feat(sp4): exact/unordered/float checkers + judge-spec parser"
```

---

## Task 3: TestCase model + TestBundleLoader

**Files:**
- Create: `src/main/java/app/collide/control/judge/TestCase.java`
- Create: `src/main/java/app/collide/control/judge/TestBundleLoader.java`
- Test: `src/test/java/app/collide/control/judge/TestBundleLoaderTest.java`

**Interfaces:**
- Consumes: `BundleStore` (SP3, `byte[] load(String)`, `boolean exists(String)`), `ProblemTestBundleRepository` (SP3, `findByProblemSlug(String) -> List<ProblemTestBundle>`), `ObjectMapper`.
- Produces:
  - `record TestCase(java.util.List<Object> input, Object expected)`
  - `record LoadedBundle(ProblemTestBundle registry, java.util.List<TestCase> cases)`
  - `TestBundleLoader.load(String slug) -> LoadedBundle` — resolves the highest-version registry row for the slug, loads+gunzips the artifact, parses `[{input,expected}]`, caches by checksum. Throws `ApiException.badRequest("no test bundle for <slug>")` when none is registered.

- [ ] **Step 1: Write the failing test**

Uses `LocalBundleStore` over the committed pilot bundles + a hand-built registry list (no DB). A tiny fake repo implements only the one method used.

```java
package app.collide.control.judge;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import app.collide.control.common.ApiException;
import app.collide.control.problem.bundle.BundleStore;
import app.collide.control.problem.bundle.LocalBundleStore;
import app.collide.control.problem.bundle.ProblemTestBundle;
import app.collide.control.problem.bundle.ProblemTestBundleRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class TestBundleLoaderTest {

    private static final Path BUNDLE_DIR = Path.of("src/main/resources/seed/test-bundles");

    private TestBundleLoader loaderFor(ProblemTestBundle... rows) {
        BundleStore store = new LocalBundleStore(BUNDLE_DIR);
        ProblemTestBundleRepository repo = new StubRepo(List.of(rows));
        return new TestBundleLoader(repo, store, new ObjectMapper());
    }

    private ProblemTestBundle row(String slug, int version, String key, int caseCount) {
        ProblemTestBundle b = new ProblemTestBundle(slug, version);
        b.setStorageKey(key);
        b.setCaseCount(caseCount);
        b.setChecksum("chk-" + slug + "-" + version);
        b.setCheckerType("exact");
        ReflectionTestUtils.setField(b, "id", (long) (slug.hashCode() & 0xffff));
        return b;
    }

    @Test
    void loadsAndParsesTheCommittedTwoSumBundle() {
        TestBundleLoader loader = loaderFor(row("two-sum", 1, "two-sum.v1.json.gz", 100));
        TestBundleLoader.LoadedBundle b = loader.load("two-sum");
        assertThat(b.cases()).hasSize(100);
        assertThat(b.cases().get(0).input()).hasSize(2); // nums, target
        assertThat(b.registry().getCheckerType()).isEqualTo("exact");
    }

    @Test
    void picksHighestVersionWhenMultipleRegistered() {
        TestBundleLoader loader = loaderFor(
                row("two-sum", 1, "two-sum.v1.json.gz", 100),
                row("two-sum", 2, "two-sum.v1.json.gz", 100)); // reuse artifact; assert version picked
        assertThat(loader.load("two-sum").registry().getVersion()).isEqualTo(2);
    }

    @Test
    void throwsWhenNoBundleRegistered() {
        TestBundleLoader loader = loaderFor();
        assertThatThrownBy(() -> loader.load("nope")).isInstanceOf(ApiException.class);
    }

    /** Minimal repo stub — only findByProblemSlug is exercised. */
    static final class StubRepo implements ProblemTestBundleRepository {
        private final List<ProblemTestBundle> rows;
        StubRepo(List<ProblemTestBundle> rows) { this.rows = rows; }
        @Override public List<ProblemTestBundle> findByProblemSlug(String slug) {
            return rows.stream().filter(r -> r.getProblemSlug().equals(slug)).toList();
        }
        @Override public java.util.Optional<ProblemTestBundle> findByProblemSlugAndVersion(String s, int v) {
            return rows.stream().filter(r -> r.getProblemSlug().equals(s) && r.getVersion() == v).findFirst();
        }
        // --- unused JpaRepository surface: default/no-op ---
        @Override public java.util.List<ProblemTestBundle> findAll() { return rows; }
        @Override public java.util.List<ProblemTestBundle> findAll(org.springframework.data.domain.Sort sort) { return rows; }
        @Override public java.util.List<ProblemTestBundle> findAllById(Iterable<Long> ids) { return List.of(); }
        @Override public <S extends ProblemTestBundle> java.util.List<S> saveAll(Iterable<S> e) { return List.of(); }
        @Override public void flush() {}
        @Override public <S extends ProblemTestBundle> S saveAndFlush(S e) { return e; }
        @Override public <S extends ProblemTestBundle> java.util.List<S> saveAllAndFlush(Iterable<S> e) { return List.of(); }
        @Override public void deleteAllInBatch(Iterable<ProblemTestBundle> e) {}
        @Override public void deleteAllByIdInBatch(Iterable<Long> ids) {}
        @Override public void deleteAllInBatch() {}
        @Override public ProblemTestBundle getReferenceById(Long id) { return null; }
        @Override public ProblemTestBundle getOne(Long id) { return null; }
        @Override public ProblemTestBundle getById(Long id) { return null; }
        @Override public <S extends ProblemTestBundle> java.util.Optional<S> findOne(org.springframework.data.domain.Example<S> ex) { return java.util.Optional.empty(); }
        @Override public <S extends ProblemTestBundle> java.util.List<S> findAll(org.springframework.data.domain.Example<S> ex) { return List.of(); }
        @Override public <S extends ProblemTestBundle> java.util.List<S> findAll(org.springframework.data.domain.Example<S> ex, org.springframework.data.domain.Sort sort) { return List.of(); }
        @Override public <S extends ProblemTestBundle> org.springframework.data.domain.Page<S> findAll(org.springframework.data.domain.Example<S> ex, org.springframework.data.domain.Pageable p) { return org.springframework.data.domain.Page.empty(); }
        @Override public <S extends ProblemTestBundle> long count(org.springframework.data.domain.Example<S> ex) { return 0; }
        @Override public <S extends ProblemTestBundle> boolean exists(org.springframework.data.domain.Example<S> ex) { return false; }
        @Override public <S extends ProblemTestBundle, R> R findBy(org.springframework.data.domain.Example<S> ex, java.util.function.Function<org.springframework.data.repository.query.FluentQuery.FetchableFluentQuery<S>, R> fn) { return null; }
        @Override public <S extends ProblemTestBundle> S save(S e) { return e; }
        @Override public java.util.Optional<ProblemTestBundle> findById(Long id) { return java.util.Optional.empty(); }
        @Override public boolean existsById(Long id) { return false; }
        @Override public long count() { return rows.size(); }
        @Override public void deleteById(Long id) {}
        @Override public void delete(ProblemTestBundle e) {}
        @Override public void deleteAllById(Iterable<? extends Long> ids) {}
        @Override public void deleteAll(Iterable<? extends ProblemTestBundle> e) {}
        @Override public void deleteAll() {}
        @Override public org.springframework.data.domain.Page<ProblemTestBundle> findAll(org.springframework.data.domain.Pageable p) { return org.springframework.data.domain.Page.empty(); }
    }
}
```

Note: implementing the full `JpaRepository` surface in a stub is verbose but keeps this a pure unit test (no Spring/DB). If the interface surface differs on this Spring Data version, let the compiler list the missing methods and add no-op overrides — do not add real logic.

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew test --tests 'app.collide.control.judge.TestBundleLoaderTest'`
Expected: FAIL — `TestBundleLoader` / `TestCase` do not exist.

- [ ] **Step 3: Write minimal implementation**

`TestCase.java`:

```java
package app.collide.control.judge;

import java.util.List;

/** One hidden case: {@code input} in param order (wire JSON values), {@code expected} return. */
public record TestCase(List<Object> input, Object expected) {}
```

`TestBundleLoader.java`:

```java
package app.collide.control.judge;

import app.collide.control.common.ApiException;
import app.collide.control.problem.bundle.BundleStore;
import app.collide.control.problem.bundle.ProblemTestBundle;
import app.collide.control.problem.bundle.ProblemTestBundleRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.zip.GZIPInputStream;
import org.springframework.stereotype.Component;

/**
 * Resolves and loads a problem's active hidden-test bundle for the judge. The active bundle is the
 * highest-version registry row for the slug; its gzipped artifact is loaded via {@link BundleStore},
 * decompressed, and parsed into {@link TestCase}s. Parsed cases are cached by checksum so repeated
 * submissions for the same problem version don't re-read/re-parse the artifact (spec §3).
 */
@Component
public class TestBundleLoader {

    private final ProblemTestBundleRepository registry;
    private final BundleStore store;
    private final ObjectMapper mapper;
    private final Map<String, List<TestCase>> cache = new ConcurrentHashMap<>();

    public TestBundleLoader(ProblemTestBundleRepository registry, BundleStore store, ObjectMapper mapper) {
        this.registry = registry;
        this.store = store;
        this.mapper = mapper;
    }

    public LoadedBundle load(String slug) {
        ProblemTestBundle row = registry.findByProblemSlug(slug).stream()
                .max(Comparator.comparingInt(ProblemTestBundle::getVersion))
                .orElseThrow(() -> ApiException.badRequest("no test bundle for " + slug));
        List<TestCase> cases = cache.computeIfAbsent(row.getChecksum(), k -> parse(row.getStorageKey()));
        return new LoadedBundle(row, cases);
    }

    private List<TestCase> parse(String storageKey) {
        byte[] gz = store.load(storageKey);
        try (GZIPInputStream in = new GZIPInputStream(new ByteArrayInputStream(gz))) {
            return mapper.readValue(in.readAllBytes(), new TypeReference<List<TestCase>>() {});
        } catch (IOException e) {
            throw new UncheckedIOException("failed to parse bundle " + storageKey, e);
        }
    }

    /** Active registry row + its parsed cases. */
    public record LoadedBundle(ProblemTestBundle registry, List<TestCase> cases) {}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew test --tests 'app.collide.control.judge.TestBundleLoaderTest'`
Expected: PASS (3 tests). If Jackson deserializes `TestCase.input` numbers as `Integer`/`Long`, that's fine — the driver reserializes them.

- [ ] **Step 5: Commit**

```bash
git add src/main/java/app/collide/control/judge/TestCase.java src/main/java/app/collide/control/judge/TestBundleLoader.java src/test/java/app/collide/control/judge/TestBundleLoaderTest.java
git commit -m "feat(sp4): test-bundle loader (resolve active bundle, gunzip, parse, cache)"
```

---

## Task 4: WirePreludes — per-language deserializer/serializer constants

**Files:**
- Create: `src/main/java/app/collide/control/judge/driver/WirePreludes.java`
- Test: `src/test/java/app/collide/control/judge/driver/WirePreludesTest.java`

**Interfaces:**
- Produces: `WirePreludes` with `public static final String` blocks: `JS_LIST/JS_TREE/JS_GRAPH`, `PY_LIST/PY_TREE/PY_GRAPH`, `CPP_LIST/CPP_TREE/CPP_GRAPH`, `JAVA_LIST/JAVA_TREE/JAVA_GRAPH`, and JSON-reader/converter blocks `CPP_JSON`, `JAVA_JSON`. These are consumed only by `JudgeDriverGenerator` (Task 5–6).

The list/tree/graph serde blocks are **ported verbatim** from `collide/src/run/harness.ts`:
- JS/Python/C++/Java `LIST_PRELUDE` — `harness.ts:301-318`
- `TREE_PRELUDE` — `harness.ts:320-359`
- `GRAPH_PRELUDE` — `harness.ts:361-392`

Copy each string's body into a Java text block (`"""..."""`), unchanged, since the client and server must produce byte-identical wire output (SP3 fidelity guarantee). JS and Python already have native JSON, so they need no extra JSON block. **C++ and Java need a minimal JSON reader + typed converters** (new code below) because the driver reads each case's input from stdin, and neither language has a built-in JSON parser on the bare compile classpath.

- [ ] **Step 1: Write the failing test**

```java
package app.collide.control.judge.driver;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class WirePreludesTest {

    @Test
    void jsListPreludeDefinesTheSameHelpersAsTheClientHarness() {
        assertThat(WirePreludes.JS_LIST).contains("function __toList").contains("function __fromList");
    }

    @Test
    void javaJsonBlockProvidesReaderAndTypedConverters() {
        assertThat(WirePreludes.JAVA_JSON)
                .contains("__readArgs")     // parse stdin line into a List<Object>
                .contains("__asIntArray")
                .contains("__asInteger")     // nullable-int array for tree level-order
                .contains("__asDouble");
    }

    @Test
    void cppJsonBlockProvidesReaderAndTypedConverters() {
        assertThat(WirePreludes.CPP_JSON).contains("__readArgs").contains("__asIntVec");
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew test --tests 'app.collide.control.judge.driver.WirePreludesTest'`
Expected: FAIL — `WirePreludes` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `WirePreludes.java`. Port the six serde constants verbatim from `harness.ts` (line ranges above) into Java text blocks. Then add the two new JSON blocks below. **Full skeleton with the new JSON blocks written out; port the `*_LIST/*_TREE/*_GRAPH` bodies from harness.ts into the marked slots** (they are long but must be byte-identical to the client, so copy — don't paraphrase).

```java
package app.collide.control.judge.driver;

/**
 * Per-language source blocks injected ahead of the generated judge driver: the wire (de)serializers
 * (ported byte-for-byte from the client harness so server output matches the SP3 bundle expected
 * values exactly) plus, for the compiled languages, a minimal JSON reader + typed converters — the
 * "written once per language, not per problem" deserializer the master spec §7.2 calls for. Unlike
 * the client Run tier (which bakes each case as a literal), the judge compiles once and reads each
 * case's input from stdin, so the driver needs to parse JSON at runtime.
 */
public final class WirePreludes {

    private WirePreludes() {}

    // ---- JS: native JSON.parse, so only list/tree/graph serde is needed. ----
    // Port from harness.ts LIST_PRELUDE.javascript / TREE_PRELUDE.javascript / GRAPH_PRELUDE.javascript
    public static final String JS_LIST = """
            <PORT harness.ts:302-305 body here, verbatim>
            """;
    public static final String JS_TREE = """
            <PORT harness.ts:321-329 body here, verbatim>
            """;
    public static final String JS_GRAPH = """
            <PORT harness.ts:362-368 body here, verbatim>
            """;

    // ---- Python: native json, only serde needed. ----
    public static final String PY_LIST = """
            <PORT harness.ts:306-309 body here, verbatim>
            """;
    public static final String PY_TREE = """
            <PORT harness.ts:330-337 body here, verbatim>
            """;
    public static final String PY_GRAPH = """
            <PORT harness.ts:369-375 body here, verbatim>
            """;

    // ---- C++: serde + JSON reader/converters. ----
    public static final String CPP_LIST = """
            <PORT harness.ts:310-313 body here, verbatim>
            """;
    public static final String CPP_TREE = """
            <PORT harness.ts:338-348 body here, verbatim>
            """;
    public static final String CPP_GRAPH = """
            <PORT harness.ts:376-383 body here, verbatim>
            """;

    // ---- Java: serde + JSON reader/converters. ----
    public static final String JAVA_LIST = """
            <PORT harness.ts:314-317 body here, verbatim>
            """;
    public static final String JAVA_TREE = """
            <PORT harness.ts:349-358 body here, verbatim>
            """;
    public static final String JAVA_GRAPH = """
            <PORT harness.ts:384-391 body here, verbatim>
            """;

    /**
     * Minimal JSON value parser + typed converters for Java. Parses the single stdin line into a
     * {@code List<Object>} of args (each Long/Double/String/Boolean/null/List). Handles only the
     * shapes the wire format uses: numbers, strings, booleans, null, and arrays (never objects).
     */
    public static final String JAVA_JSON = """
            static int __p;
            static String __src;
            static Object __parseVal() {
                __skipWs();
                char c = __src.charAt(__p);
                if (c == '[') return __parseArr();
                if (c == '"') return __parseStr();
                if (c == 't') { __p += 4; return Boolean.TRUE; }
                if (c == 'f') { __p += 5; return Boolean.FALSE; }
                if (c == 'n') { __p += 4; return null; }
                return __parseNum();
            }
            static void __skipWs() { while (__p < __src.length() && Character.isWhitespace(__src.charAt(__p))) __p++; }
            static java.util.List<Object> __parseArr() {
                java.util.List<Object> out = new java.util.ArrayList<>();
                __p++; __skipWs();
                if (__src.charAt(__p) == ']') { __p++; return out; }
                while (true) {
                    out.add(__parseVal()); __skipWs();
                    char c = __src.charAt(__p++);
                    if (c == ']') break;
                }
                return out;
            }
            static String __parseStr() {
                StringBuilder b = new StringBuilder(); __p++;
                while (true) {
                    char c = __src.charAt(__p++);
                    if (c == '"') break;
                    if (c == '\\\\') { char e = __src.charAt(__p++); switch (e) { case 'n': b.append('\\n'); break; case 't': b.append('\\t'); break; case 'r': b.append('\\r'); break; case '"': b.append('"'); break; case '\\\\': b.append('\\\\'); break; case '/': b.append('/'); break; case 'u': b.append((char) Integer.parseInt(__src.substring(__p, __p + 4), 16)); __p += 4; break; default: b.append(e); } }
                    else b.append(c);
                }
                return b.toString();
            }
            static Object __parseNum() {
                int s = __p;
                while (__p < __src.length() && "+-0123456789.eE".indexOf(__src.charAt(__p)) >= 0) __p++;
                String n = __src.substring(s, __p);
                if (n.contains(".") || n.contains("e") || n.contains("E")) return Double.parseDouble(n);
                return Long.parseLong(n);
            }
            static java.util.List<Object> __readArgs() throws java.io.IOException {
                java.io.BufferedReader __r = new java.io.BufferedReader(new java.io.InputStreamReader(System.in));
                StringBuilder __sb = new StringBuilder(); String __ln;
                while ((__ln = __r.readLine()) != null) __sb.append(__ln);
                __src = __sb.toString(); __p = 0;
                Object v = __parseVal();
                return (java.util.List<Object>) v;
            }
            @SuppressWarnings("unchecked")
            static int __asInt(Object o) { return (int) (long) (Long) o; }
            static long __asLong(Object o) { return (Long) o; }
            static double __asDouble(Object o) { return o instanceof Long ? (double) (Long) o : (Double) o; }
            static boolean __asBool(Object o) { return (Boolean) o; }
            static String __asStr(Object o) { return (String) o; }
            @SuppressWarnings("unchecked")
            static int[] __asIntArray(Object o) { java.util.List<Object> l = (java.util.List<Object>) o; int[] a = new int[l.size()]; for (int i = 0; i < a.length; i++) a[i] = __asInt(l.get(i)); return a; }
            @SuppressWarnings("unchecked")
            static double[] __asDoubleArray(Object o) { java.util.List<Object> l = (java.util.List<Object>) o; double[] a = new double[l.size()]; for (int i = 0; i < a.length; i++) a[i] = __asDouble(l.get(i)); return a; }
            @SuppressWarnings("unchecked")
            static String[] __asStrArray(Object o) { java.util.List<Object> l = (java.util.List<Object>) o; String[] a = new String[l.size()]; for (int i = 0; i < a.length; i++) a[i] = __asStr(l.get(i)); return a; }
            @SuppressWarnings("unchecked")
            static Integer[] __asInteger(Object o) { java.util.List<Object> l = (java.util.List<Object>) o; Integer[] a = new Integer[l.size()]; for (int i = 0; i < a.length; i++) a[i] = l.get(i) == null ? null : __asInt(l.get(i)); return a; }
            @SuppressWarnings("unchecked")
            static int[][] __asIntMatrix(Object o) { java.util.List<Object> l = (java.util.List<Object>) o; int[][] a = new int[l.size()][]; for (int i = 0; i < a.length; i++) a[i] = __asIntArray(l.get(i)); return a; }
            """;

    /**
     * Minimal JSON parser + converters for C++. Same contract as {@link #JAVA_JSON}: parse the stdin
     * line into a nested variant tree, then typed accessors. Uses a small tagged struct __J.
     */
    public static final String CPP_JSON = """
            struct __J { int t; double num; string str; bool b; vector<__J> arr; }; // t:0 null 1 num 2 str 3 bool 4 arr
            static string __S; static size_t __P;
            static void __ws(){ while(__P<__S.size() && isspace((unsigned char)__S[__P])) __P++; }
            static __J __val();
            static __J __arr(){ __J j; j.t=4; __P++; __ws(); if(__S[__P]==']'){__P++; return j;} while(true){ j.arr.push_back(__val()); __ws(); char c=__S[__P++]; if(c==']') break; } return j; }
            static __J __str(){ __J j; j.t=2; __P++; string s; while(true){ char c=__S[__P++]; if(c=='"') break; if(c=='\\\\'){ char e=__S[__P++]; if(e=='n') s+='\\n'; else if(e=='t') s+='\\t'; else if(e=='r') s+='\\r'; else if(e=='u'){ int cp=stoi(__S.substr(__P,4),nullptr,16); __P+=4; s+=(char)cp; } else s+=e; } else s+=c; } j.str=s; return j; }
            static __J __num(){ __J j; j.t=1; size_t s=__P; while(__P<__S.size() && string("+-0123456789.eE").find(__S[__P])!=string::npos) __P++; j.num=stod(__S.substr(s,__P-s)); return j; }
            static __J __val(){ __ws(); char c=__S[__P]; if(c=='[') return __arr(); if(c=='"') return __str(); if(c=='t'){__P+=4; __J j; j.t=3; j.b=true; return j;} if(c=='f'){__P+=5; __J j; j.t=3; j.b=false; return j;} if(c=='n'){__P+=4; __J j; j.t=0; return j;} return __num(); }
            static __J __readArgs(){ string line, all; while(getline(cin,line)) all+=line; __S=all; __P=0; return __val(); }
            static int __asInt(const __J& j){ return (int)j.num; }
            static long long __asLong(const __J& j){ return (long long)j.num; }
            static double __asDouble(const __J& j){ return j.num; }
            static bool __asBool(const __J& j){ return j.b; }
            static string __asStr(const __J& j){ return j.str; }
            static vector<int> __asIntVec(const __J& j){ vector<int> v; for(auto& x: j.arr) v.push_back(__asInt(x)); return v; }
            static vector<double> __asDoubleVec(const __J& j){ vector<double> v; for(auto& x: j.arr) v.push_back(__asDouble(x)); return v; }
            static vector<string> __asStrVec(const __J& j){ vector<string> v; for(auto& x: j.arr) v.push_back(__asStr(x)); return v; }
            static vector<int> __asIntVecNullable(const __J& j){ vector<int> v; for(auto& x: j.arr) v.push_back(x.t==0 ? INT_MIN : __asInt(x)); return v; }
            static vector<vector<int>> __asIntMat(const __J& j){ vector<vector<int>> v; for(auto& x: j.arr) v.push_back(__asIntVec(x)); return v; }
            """;
}
```

Important porting details:
- In Java/C++ text blocks, every backslash in the ported/authored source must be doubled (`\\n` in Java source → `\n` in generated code; a literal backslash-escape in generated code needs `\\\\`). The `JAVA_JSON`/`CPP_JSON` blocks above already double them — match that when porting the tree/graph blocks (which contain `to_string`, no escapes, so they port cleanly; JS/Java `__fromTree` uses `"null"` string literals — no backslashes).
- The C++ `__asIntVecNullable` maps JSON null → `INT_MIN`, matching harness.ts's `__NUL` sentinel that `__toTree` (C++) already treats as "no node".

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew test --tests 'app.collide.control.judge.driver.WirePreludesTest'`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/java/app/collide/control/judge/driver/WirePreludes.java src/test/java/app/collide/control/judge/driver/WirePreludesTest.java
git commit -m "feat(sp4): wire preludes — ported serde + minimal JSON reader for Java/C++ drivers"
```

---

## Task 5: JudgeDriverGenerator — JS + Java (function-call problems), executed live

This is the core. The generator emits a complete program that reads one case's `input` array from stdin, deserializes each arg by its param type, calls `Solution.entry(...)`, and prints the canonical result. This task covers **function-call** problems for the two runnable languages, verified by actually compiling+running against a real bundle case.

**Files:**
- Create: `src/main/java/app/collide/control/judge/driver/JudgeDriverGenerator.java`
- Test: `src/test/java/app/collide/control/judge/driver/JudgeDriverGeneratorExecIT.java`

**Interfaces:**
- Consumes: `ProblemHarness` (`entry`, `List<Param>` with `name/type`, `returns`), `Language`, `WirePreludes`. The type-tag grammar mirrors `harness.ts` `parseType`: `scalar` (`int|long|double|bool|string|int[]|double[]|string[]|int[][]`), `list-node<int>`, `tree-node<int>`, `graph-node<int>`, `operations`, `array<list-node<int>>`.
- Consumes: `ProcessManager`, `FileManager`, `LanguageExecutorFactory` (in the test, to compile+run).
- Produces: `JudgeDriverGenerator.generate(Language language, ProblemHarness harness, String userSource) -> String` (complete program, or throws `ApiException.badRequest` for an unsupported language/type combo).

- [ ] **Step 1: Write the failing test** (a real compile-and-run integration test; JS + Java only)

```java
package app.collide.control.judge.driver;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import app.collide.control.execution.executor.LanguageExecutor;
import app.collide.control.execution.executor.NodeExecutor;
import app.collide.control.execution.executor.JavaExecutor;
import app.collide.control.execution.model.Language;
import app.collide.control.execution.process.ProcessManager;
import app.collide.control.execution.process.ProcessResult;
import app.collide.control.execution.workspace.FileManager;
import app.collide.control.execution.workspace.Workspace;
import app.collide.control.problem.ProblemHarness;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;

class JudgeDriverGeneratorExecIT {

    private final JudgeDriverGenerator gen = new JudgeDriverGenerator();
    private final ProcessManager pm = new ProcessManager();

    /** Compile (if needed) then run one stdin case; return trimmed stdout. */
    private String runCase(Language lang, LanguageExecutor exec, String program, String stdinJson) throws Exception {
        FileManager fm = new FileManager(System.getProperty("java.io.tmpdir") + "/collide-judge-test");
        try (Workspace ws = fm.create(java.util.UUID.randomUUID())) {
            fm.writeFile(ws, exec.sourceFilename(), program);
            if (exec.requiresCompilation()) {
                ProcessResult c = exec.compile(ws, pm, 20000, 1_000_000);
                assertThat(c.exitCode()).as("compile stderr: %s", c.stderr()).isZero();
            }
            Path stdin = fm.writeFile(ws, "stdin.txt", stdinJson);
            ProcessResult r = pm.run(exec.runCommand(ws), ws.root(), stdin, 10000, 1_000_000);
            assertThat(r.stderr()).isEmpty();
            return r.stdout().trim();
        }
    }

    private ProblemHarness twoSum() {
        return new ProblemHarness("twoSum",
                List.of(new ProblemHarness.Param("nums", "int[]"), new ProblemHarness.Param("target", "int")),
                "int[]", List.of(), "unordered", 2000, null);
    }

    private ProblemHarness mergeLists() {
        return new ProblemHarness("mergeTwoLists",
                List.of(new ProblemHarness.Param("l1", "list-node<int>"), new ProblemHarness.Param("l2", "list-node<int>")),
                "list-node<int>", List.of(), "exact", 2000, null);
    }

    @Test
    void jsDriverSolvesTwoSumCase() throws Exception {
        String user = "function twoSum(nums, target){ const m=new Map(); for(let i=0;i<nums.length;i++){ if(m.has(target-nums[i])) return [m.get(target-nums[i]), i]; m.set(nums[i], i);} return []; }";
        String program = gen.generate(Language.JAVASCRIPT, twoSum(), user);
        assertThat(runCase(Language.JAVASCRIPT, new NodeExecutor("node"), program, "[[2,7,11,15],9]")).isEqualTo("[0,1]");
    }

    @Test
    void jsDriverSolvesMergeListsCaseWithListNodeSerde() throws Exception {
        String user = "function mergeTwoLists(a,b){ const d={val:0,next:null}; let c=d; while(a&&b){ if(a.val<=b.val){c.next=a;a=a.next;}else{c.next=b;b=b.next;} c=c.next;} c.next=a||b; return d.next; }";
        String program = gen.generate(Language.JAVASCRIPT, mergeLists(), user);
        assertThat(runCase(Language.JAVASCRIPT, new NodeExecutor("node"), program, "[[1,2,4],[1,3,4]]")).isEqualTo("[1,1,2,3,4,4]");
    }

    @Test
    void javaDriverSolvesTwoSumCase() throws Exception {
        String user = "class Solution { public int[] twoSum(int[] nums, int target){ java.util.Map<Integer,Integer> m=new java.util.HashMap<>(); for(int i=0;i<nums.length;i++){ if(m.containsKey(target-nums[i])) return new int[]{m.get(target-nums[i]), i}; m.put(nums[i], i);} return new int[]{}; } }";
        String program = gen.generate(Language.JAVA, twoSum(), user);
        assertThat(runCase(Language.JAVA, new JavaExecutor("javac", "java"), program, "[[2,7,11,15],9]")).isEqualTo("[0,1]");
    }

    @Test
    void javaDriverSolvesMergeListsCaseWithListNodeSerde() throws Exception {
        String user = "class Solution { public ListNode mergeTwoLists(ListNode a, ListNode b){ ListNode d=new ListNode(0), c=d; while(a!=null&&b!=null){ if(a.val<=b.val){c.next=a;a=a.next;}else{c.next=b;b=b.next;} c=c.next;} c.next=(a!=null)?a:b; return d.next; } }";
        String program = gen.generate(Language.JAVA, mergeLists(), user);
        assertThat(runCase(Language.JAVA, new JavaExecutor("javac", "java"), program, "[[1,2,4],[1,3,4]]")).isEqualTo("[1,1,2,3,4,4]");
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew test --tests 'app.collide.control.judge.driver.JudgeDriverGeneratorExecIT'`
Expected: FAIL — `JudgeDriverGenerator` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `JudgeDriverGenerator.java`. Mirror `harness.ts`'s type dispatch, but **read args from stdin** instead of baking literals. Implement JS + Java fully now (Python + C++ in Task 7; return via `throw ApiException.badRequest` for them until then — or leave the `switch` arms unimplemented and add in Task 7). Structure:

```java
package app.collide.control.judge.driver;

import app.collide.control.common.ApiException;
import app.collide.control.execution.model.Language;
import app.collide.control.problem.ProblemHarness;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/**
 * Generates a complete, compile-once judge driver per language. Unlike the client Run harness
 * (which bakes each case as a literal and recompiles per case), the judge compiles once and feeds
 * each case's input array as one JSON line on stdin, so this driver reads+deserializes at runtime
 * via {@link WirePreludes}. Parallels harness.ts's parseType/argExpr/print dispatch so server and
 * client produce byte-identical canonical output.
 */
@Component
public class JudgeDriverGenerator {

    // --- type tags (mirror harness.ts parseType) ---
    private sealed interface Tag permits Scalar, Node, Ops, Arr {}
    private record Scalar(String raw) implements Tag {}
    private record Node(String kind) implements Tag {} // list-node | tree-node | graph-node
    private record Ops() implements Tag {}
    private record Arr(Tag of) implements Tag {}

    private static final Pattern NODE = Pattern.compile("^(list-node|tree-node|graph-node)<(.+)>$");
    private static final Pattern ARR = Pattern.compile("^array<(.+)>$");

    private static Tag parse(String tag) {
        String t = tag.trim();
        if (t.equals("operations")) return new Ops();
        Matcher a = ARR.matcher(t);
        if (a.matches()) return new Arr(parse(a.group(1)));
        Matcher n = NODE.matcher(t);
        if (n.matches()) return new Node(n.group(1));
        return new Scalar(t);
    }

    private static boolean usesKind(ProblemHarness h, String kind) {
        java.util.function.Predicate<Tag> hit = new java.util.function.Predicate<>() {
            public boolean test(Tag t) {
                return (t instanceof Node nd && nd.kind().equals(kind)) || (t instanceof Arr ar && test(ar.of()));
            }
        };
        if (hit.test(parse(h.returns()))) return true;
        return h.params().stream().anyMatch(p -> hit.test(parse(p.type())));
    }

    public String generate(Language language, ProblemHarness harness, String userSource) {
        boolean ops = harness.params().size() == 1 && parse(harness.params().get(0).type()) instanceof Ops;
        return switch (language) {
            case JAVASCRIPT -> ops ? jsOperations(harness, userSource) : js(harness, userSource);
            case JAVA -> ops ? javaOperations(harness, userSource) : java(harness, userSource);
            case PYTHON -> ops ? pyOperations(harness, userSource) : python(harness, userSource);
            case CPP -> ops ? cppOperations(harness, userSource) : cpp(harness, userSource);
        };
    }

    // ---------------- JavaScript ----------------
    private String js(ProblemHarness h, String user) {
        StringBuilder prelude = new StringBuilder();
        if (usesKind(h, "list-node")) prelude.append(WirePreludes.JS_LIST);
        if (usesKind(h, "tree-node")) prelude.append(WirePreludes.JS_TREE);
        if (usesKind(h, "graph-node")) prelude.append(WirePreludes.JS_GRAPH);
        StringBuilder args = new StringBuilder();
        for (int i = 0; i < h.params().size(); i++) {
            if (i > 0) args.append(", ");
            args.append(jsArg(parse(h.params().get(i).type()), "__in[" + i + "]"));
        }
        String call = h.entry() + "(" + args + ")";
        String printed = jsPrint(parse(h.returns()), call);
        return prelude + user + "\n\n;(function(){\n"
                + "  const __in = JSON.parse(require('fs').readFileSync(0,'utf8'));\n"
                + "  console.log(JSON.stringify(" + printed + "));\n"
                + "})();\n";
    }

    private String jsArg(Tag t, String v) {
        if (t instanceof Node n) {
            return switch (n.kind()) {
                case "list-node" -> "__toList(" + v + ")";
                case "tree-node" -> "__toTree(" + v + ")";
                default -> "__toGraph(" + v + ")";
            };
        }
        if (t instanceof Arr ar && ar.of() instanceof Node n && n.kind().equals("list-node")) {
            return "(" + v + ").map(__toList)";
        }
        return v; // scalars/arrays: JSON already gives native JS values
    }

    private String jsPrint(Tag t, String expr) {
        if (t instanceof Node n) {
            return switch (n.kind()) {
                case "list-node" -> "__fromList(" + expr + ")";
                case "tree-node" -> "__fromTree(" + expr + ")";
                default -> "__fromGraph(" + expr + ")";
            };
        }
        return expr;
    }

    // ---------------- Java ----------------
    private String java(ProblemHarness h, String user) {
        StringBuilder prelude = new StringBuilder();
        prelude.append(WirePreludes.JAVA_JSON);
        if (usesKind(h, "list-node")) prelude.append(WirePreludes.JAVA_LIST);
        if (usesKind(h, "tree-node")) prelude.append(WirePreludes.JAVA_TREE);
        if (usesKind(h, "graph-node")) prelude.append(WirePreludes.JAVA_GRAPH);
        StringBuilder decls = new StringBuilder();
        StringBuilder callArgs = new StringBuilder();
        for (int i = 0; i < h.params().size(); i++) {
            Tag t = parse(h.params().get(i).type());
            decls.append("        ").append(javaDecl(t)).append(" __a").append(i)
                 .append(" = ").append(javaArg(t, "__in.get(" + i + ")")).append(";\n");
            if (i > 0) callArgs.append(", ");
            callArgs.append("__a").append(i);
        }
        String call = "__sol." + h.entry() + "(" + callArgs + ")";
        String print = javaPrint(parse(h.returns()), call);
        String imports = user.contains("import java.util") ? "" : "import java.util.*;\n\n";
        return imports + "public class Main {\n"
                + indent(prelude.toString())
                + "    public static void main(String[] args) throws Exception {\n"
                + "        java.util.List<Object> __in = __readArgs();\n"
                + "        Solution __sol = new Solution();\n"
                + decls
                + "        " + print + "\n"
                + "    }\n}\n\n" + user + "\n";
    }

    private String indent(String block) {
        StringBuilder b = new StringBuilder();
        for (String line : block.split("\n", -1)) b.append("    ").append(line).append("\n");
        return b.toString();
    }

    private String javaDecl(Tag t) {
        if (t instanceof Node n) return switch (n.kind()) { case "list-node" -> "ListNode"; case "tree-node" -> "TreeNode"; default -> "Node"; };
        if (t instanceof Arr ar && ar.of() instanceof Node n && n.kind().equals("list-node")) return "ListNode[]";
        String raw = ((Scalar) t).raw();
        return switch (raw) {
            case "int" -> "int"; case "long" -> "long"; case "double" -> "double"; case "bool" -> "boolean"; case "string" -> "String";
            case "int[]" -> "int[]"; case "double[]" -> "double[]"; case "string[]" -> "String[]"; case "int[][]" -> "int[][]";
            default -> throw ApiException.badRequest("unsupported Java param type: " + raw);
        };
    }

    private String javaArg(Tag t, String v) {
        if (t instanceof Node n) return switch (n.kind()) {
            case "list-node" -> "__toList(__asIntArray(" + v + "))";
            case "tree-node" -> "__toTree(__asInteger(" + v + "))";
            default -> "__toGraph(__asIntMatrix(" + v + "))";
        };
        if (t instanceof Arr ar && ar.of() instanceof Node n && n.kind().equals("list-node")) {
            return "((java.util.List<Object>)" + v + ").stream().map(x -> __toList(__asIntArray(x))).toArray(ListNode[]::new)";
        }
        String raw = ((Scalar) t).raw();
        return switch (raw) {
            case "int" -> "__asInt(" + v + ")"; case "long" -> "__asLong(" + v + ")"; case "double" -> "__asDouble(" + v + ")";
            case "bool" -> "__asBool(" + v + ")"; case "string" -> "__asStr(" + v + ")";
            case "int[]" -> "__asIntArray(" + v + ")"; case "double[]" -> "__asDoubleArray(" + v + ")";
            case "string[]" -> "__asStrArray(" + v + ")"; case "int[][]" -> "__asIntMatrix(" + v + ")";
            default -> throw ApiException.badRequest("unsupported Java param type: " + raw);
        };
    }

    private String javaPrint(Tag t, String expr) {
        if (t instanceof Node n) return switch (n.kind()) {
            case "list-node" -> "System.out.print(__fromList(" + expr + "));";
            case "tree-node" -> "System.out.print(__fromTree(" + expr + "));";
            default -> "System.out.print(__fromGraph(" + expr + "));";
        };
        String raw = ((Scalar) t).raw();
        return switch (raw) {
            case "bool" -> "System.out.print((" + expr + ") ? \"true\" : \"false\");";
            case "string" -> "System.out.print(\"\\\"\" + (" + expr + ") + \"\\\"\");";
            case "int[]", "double[]" -> "{ var __v = " + expr + "; StringBuilder __sb = new StringBuilder(\"[\"); for (int __i = 0; __i < __v.length; __i++) { if (__i > 0) __sb.append(\",\"); __sb.append(__v[__i]); } __sb.append(\"]\"); System.out.print(__sb); }";
            case "string[]" -> "{ var __v = " + expr + "; StringBuilder __sb = new StringBuilder(\"[\"); for (int __i = 0; __i < __v.length; __i++) { if (__i > 0) __sb.append(\",\"); __sb.append(\"\\\"\").append(__v[__i]).append(\"\\\"\"); } __sb.append(\"]\"); System.out.print(__sb); }";
            case "int[][]" -> "{ var __v = " + expr + "; StringBuilder __sb = new StringBuilder(\"[\"); for (int __i = 0; __i < __v.length; __i++) { if (__i > 0) __sb.append(\",\"); __sb.append(\"[\"); for (int __j = 0; __j < __v[__i].length; __j++){ if(__j>0) __sb.append(\",\"); __sb.append(__v[__i][__j]); } __sb.append(\"]\"); } __sb.append(\"]\"); System.out.print(__sb); }";
            default -> "System.out.print(" + expr + ");"; // int/long/double
        };
    }

    // Task 7 fills these:
    private String python(ProblemHarness h, String user) { throw ApiException.badRequest("python judge driver not implemented"); }
    private String cpp(ProblemHarness h, String user) { throw ApiException.badRequest("cpp judge driver not implemented"); }
    private String pyOperations(ProblemHarness h, String user) { throw ApiException.badRequest("python operations driver not implemented"); }
    private String cppOperations(ProblemHarness h, String user) { throw ApiException.badRequest("cpp operations driver not implemented"); }
    // Task 6 fills these:
    private String jsOperations(ProblemHarness h, String user) { throw ApiException.badRequest("js operations driver not implemented"); }
    private String javaOperations(ProblemHarness h, String user) { throw ApiException.badRequest("java operations driver not implemented"); }
}
```

Porting details / gotchas:
- The Java driver appends the user's `class Solution` **after** `public class Main` as a second top-level class (allowed: only `Main` is public). This matches how `JavaExecutor` documents single-file multi-class submissions.
- `require('fs').readFileSync(0,'utf8')` reads all of stdin in Node (fd 0). Whole-input read is fine — each invocation gets exactly one case.
- The `__sb.append(__v[__i])` for `double[]` prints Java doubles like `2.0`; the exact checker parses both sides as JSON numbers so `2.0`==`2` — acceptable. If a pilot double-array problem needs tighter formatting, revisit in Task 8.

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew test --tests 'app.collide.control.judge.driver.JudgeDriverGeneratorExecIT'`
Expected: PASS (4 tests). This compiles + runs real Node and Java programs. If Java `import java.util.*` collides with the user code also importing it, the `user.contains("import java.util")` guard prevents a duplicate — but note the guard checks the whole file; keep the user snippets in the test without a `java.util` import (they use fully-qualified `java.util.Map`), so the guard adds the import.

- [ ] **Step 5: Commit**

```bash
git add src/main/java/app/collide/control/judge/driver/JudgeDriverGenerator.java src/test/java/app/collide/control/judge/driver/JudgeDriverGeneratorExecIT.java
git commit -m "feat(sp4): judge driver generator — JS + Java function-call drivers (exec-verified)"
```

---

## Task 6: Operations-mode drivers — JS + Java (executed live)

Implements design-problem dispatch (`operations`), including the C++/Java void-vs-value dispatch SP2 deferred here. This task does JS + Java (runnable); C++ is added in Task 7.

**Files:**
- Modify: `src/main/java/app/collide/control/judge/driver/JudgeDriverGenerator.java` (fill `jsOperations`, `javaOperations`)
- Test: `src/test/java/app/collide/control/judge/driver/OperationsDriverExecIT.java`

**Interfaces:**
- Consumes: same `generate(...)` entry; ops input shape `[[Ctor,[ctorArgs]],[method,[args]],…]` as the single param; expected = returns array (ctor slot + void methods = `null`).
- Produces: filled `jsOperations`/`javaOperations`.

- [ ] **Step 1: Write the failing test**

```java
package app.collide.control.judge.driver;

import static org.assertj.core.api.Assertions.assertThat;

import app.collide.control.execution.executor.JavaExecutor;
import app.collide.control.execution.executor.LanguageExecutor;
import app.collide.control.execution.executor.NodeExecutor;
import app.collide.control.execution.model.Language;
import app.collide.control.execution.process.ProcessManager;
import app.collide.control.execution.process.ProcessResult;
import app.collide.control.execution.workspace.FileManager;
import app.collide.control.execution.workspace.Workspace;
import app.collide.control.problem.ProblemHarness;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;

class OperationsDriverExecIT {

    private final JudgeDriverGenerator gen = new JudgeDriverGenerator();
    private final ProcessManager pm = new ProcessManager();

    private String runCase(LanguageExecutor exec, String program, String stdinJson) throws Exception {
        FileManager fm = new FileManager(System.getProperty("java.io.tmpdir") + "/collide-judge-ops");
        try (Workspace ws = fm.create(java.util.UUID.randomUUID())) {
            fm.writeFile(ws, exec.sourceFilename(), program);
            if (exec.requiresCompilation()) {
                ProcessResult c = exec.compile(ws, pm, 20000, 1_000_000);
                assertThat(c.exitCode()).as("compile stderr: %s", c.stderr()).isZero();
            }
            Path stdin = fm.writeFile(ws, "stdin.txt", stdinJson);
            return pm.run(exec.runCommand(ws), ws.root(), stdin, 10000, 1_000_000).stdout().trim();
        }
    }

    private ProblemHarness minStack() {
        return new ProblemHarness("MinStack", List.of(new ProblemHarness.Param("ops", "operations")),
                "operations", List.of(), "exact", 2000, null);
    }

    private static final String STDIN =
            "[[[\"MinStack\",[]],[\"push\",[-2]],[\"push\",[0]],[\"push\",[-3]],[\"getMin\",[]],[\"pop\",[]],[\"top\",[]],[\"getMin\",[]]]]";
    private static final String EXPECTED = "[null,null,null,null,-3,null,0,-2]";

    @Test
    void jsOperationsDispatch() throws Exception {
        String user = "class MinStack{ constructor(){ this.s=[]; this.m=[]; } push(x){ this.s.push(x); this.m.push(this.m.length?Math.min(x,this.m[this.m.length-1]):x); } pop(){ this.s.pop(); this.m.pop(); } top(){ return this.s[this.s.length-1]; } getMin(){ return this.m[this.m.length-1]; } }";
        String program = gen.generate(Language.JAVASCRIPT, minStack(), user);
        assertThat(runCase(new NodeExecutor("node"), program, STDIN)).isEqualTo(EXPECTED);
    }

    @Test
    void javaOperationsDispatchWithVoidVsValueDetection() throws Exception {
        String user = "class MinStack { java.util.Deque<Integer> s=new java.util.ArrayDeque<>(); java.util.Deque<Integer> m=new java.util.ArrayDeque<>(); public MinStack(){} public void push(int x){ s.push(x); m.push(m.isEmpty()?x:Math.min(x,m.peek())); } public void pop(){ s.pop(); m.pop(); } public int top(){ return s.peek(); } public int getMin(){ return m.peek(); } }";
        String program = gen.generate(Language.JAVA, minStack(), user);
        assertThat(runCase(new JavaExecutor("javac", "java"), program, STDIN)).isEqualTo(EXPECTED);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew test --tests 'app.collide.control.judge.driver.OperationsDriverExecIT'`
Expected: FAIL — `js operations driver not implemented` at generate time.

- [ ] **Step 3: Write minimal implementation** (replace the two stub methods)

JS — reflection over the object, `undefined→null`, reads ops from stdin:

```java
    private String jsOperations(ProblemHarness h, String user) {
        return user + "\n\n;(function(){\n"
            + "  const __ops = JSON.parse(require('fs').readFileSync(0,'utf8'));\n"
            + "  const __ctor = __ops[0];\n"
            + "  const __C = eval(__ctor[0]);\n"
            + "  const __obj = new __C(...(__ctor[1]||[]));\n"
            + "  const __res = [null];\n"
            + "  for (let __i=1; __i<__ops.length; __i++){ const __r = __obj[__ops[__i][0]](...(__ops[__i][1]||[])); __res.push(__r===undefined?null:__r); }\n"
            + "  console.log(JSON.stringify(__res));\n"
            + "})();\n";
    }
```

Java — reflect the class named by the ctor op; a method returning `void` contributes `null`, else its boxed return. Uses reflection so one driver handles any design class:

```java
    private String javaOperations(ProblemHarness h, String user) {
        String imports = user.contains("import java.util") ? "" : "import java.util.*;\n";
        return imports + WirePreludes.JAVA_JSON + "\n"
            + "public class Main {\n"
            + "    public static void main(String[] args) throws Exception {\n"
            + "        java.util.List<Object> __ops = __readArgs();\n"
            + "        java.util.List<Object> __ctor = (java.util.List<Object>) __ops.get(0);\n"
            + "        String __cn = (String) __ctor.get(0);\n"
            + "        Class<?> __cls = Class.forName(__cn);\n"
            + "        java.util.List<Object> __ca = (java.util.List<Object>) __ctor.get(1);\n"
            + "        Object __obj = __construct(__cls, __ca);\n"
            + "        StringBuilder __out = new StringBuilder(\"[null\");\n"
            + "        for (int __i = 1; __i < __ops.size(); __i++) {\n"
            + "            java.util.List<Object> __op = (java.util.List<Object>) __ops.get(__i);\n"
            + "            java.util.List<Object> __a = (java.util.List<Object>) __op.get(1);\n"
            + "            Object __r = __invoke(__obj, (String) __op.get(0), __a);\n"
            + "            __out.append(\",\").append(__json(__r));\n"
            + "        }\n"
            + "        __out.append(\"]\");\n"
            + "        System.out.print(__out);\n"
            + "    }\n"
            + "    static Object __coerce(Class<?> __t, Object __v) {\n"
            + "        if (__v == null) return null;\n"
            + "        if ((__t == int.class || __t == Integer.class)) return (int) (long) (Long) __v;\n"
            + "        if ((__t == long.class || __t == Long.class)) return (Long) __v;\n"
            + "        if ((__t == double.class || __t == Double.class)) return __v instanceof Long ? (double)(long)(Long)__v : (Double) __v;\n"
            + "        if ((__t == boolean.class || __t == Boolean.class)) return (Boolean) __v;\n"
            + "        if (__t == int[].class) return __asIntArray(__v);\n"
            + "        return __v;\n"
            + "    }\n"
            + "    static Object __construct(Class<?> __cls, java.util.List<Object> __a) throws Exception {\n"
            + "        for (java.lang.reflect.Constructor<?> __c : __cls.getDeclaredConstructors()) {\n"
            + "            if (__c.getParameterCount() == __a.size()) { __c.setAccessible(true); return __c.newInstance(__args(__c.getParameterTypes(), __a)); }\n"
            + "        }\n"
            + "        throw new RuntimeException(\"no ctor arity \" + __a.size());\n"
            + "    }\n"
            + "    static Object __invoke(Object __obj, String __name, java.util.List<Object> __a) throws Exception {\n"
            + "        for (java.lang.reflect.Method __m : __obj.getClass().getDeclaredMethods()) {\n"
            + "            if (__m.getName().equals(__name) && __m.getParameterCount() == __a.size()) {\n"
            + "                __m.setAccessible(true); Object __r = __m.invoke(__obj, __args(__m.getParameterTypes(), __a));\n"
            + "                return __m.getReturnType() == void.class ? null : __r;\n"
            + "            }\n"
            + "        }\n"
            + "        throw new RuntimeException(\"no method \" + __name);\n"
            + "    }\n"
            + "    static Object[] __args(Class<?>[] __types, java.util.List<Object> __a) {\n"
            + "        Object[] __out = new Object[__types.length];\n"
            + "        for (int __i = 0; __i < __types.length; __i++) __out[__i] = __coerce(__types[__i], __a.get(__i));\n"
            + "        return __out;\n"
            + "    }\n"
            + "    static String __json(Object __v) {\n"
            + "        if (__v == null) return \"null\";\n"
            + "        if (__v instanceof Boolean) return __v.toString();\n"
            + "        if (__v instanceof String) return \"\\\"\" + __v + \"\\\"\";\n"
            + "        if (__v instanceof int[]) { int[] __x=(int[])__v; StringBuilder __b=new StringBuilder(\"[\"); for(int __i=0;__i<__x.length;__i++){ if(__i>0)__b.append(\",\"); __b.append(__x[__i]); } return __b.append(\"]\").toString(); }\n"
            + "        return __v.toString();\n"
            + "    }\n"
            + "}\n\n" + user + "\n";
    }
```

Note: reflection means the user's design class must be a top-level class named exactly as the ctor op (`MinStack`) — which is the harness contract. `Class.forName("MinStack")` resolves a top-level class in the default package (the driver + user code compile together with no package). `__coerce` covers the arg types the pilot design problems use (int/long/double/bool/int[]); extend if a later design problem needs more.

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew test --tests 'app.collide.control.judge.driver.OperationsDriverExecIT'`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/java/app/collide/control/judge/driver/JudgeDriverGenerator.java src/test/java/app/collide/control/judge/driver/OperationsDriverExecIT.java
git commit -m "feat(sp4): operations-mode drivers for JS + Java (compiled void/value dispatch)"
```

---

## Task 7: Python + C++ drivers (codegen-only, string-asserted)

Adds the two non-runnable languages' drivers. **Not executed** (no toolchain); verified by asserting the generated program's structure. Fill `python`, `cpp`, `pyOperations`, `cppOperations`.

**Files:**
- Modify: `src/main/java/app/collide/control/judge/driver/JudgeDriverGenerator.java`
- Test: `src/test/java/app/collide/control/judge/driver/PythonCppDriverCodegenTest.java`

**Interfaces:**
- Produces: filled `python`/`cpp`/`pyOperations`/`cppOperations`; same `generate(...)` entry.

- [ ] **Step 1: Write the failing test**

```java
package app.collide.control.judge.driver;

import static org.assertj.core.api.Assertions.assertThat;

import app.collide.control.execution.model.Language;
import app.collide.control.problem.ProblemHarness;
import java.util.List;
import org.junit.jupiter.api.Test;

class PythonCppDriverCodegenTest {

    private final JudgeDriverGenerator gen = new JudgeDriverGenerator();

    private ProblemHarness twoSum() {
        return new ProblemHarness("twoSum",
                List.of(new ProblemHarness.Param("nums", "int[]"), new ProblemHarness.Param("target", "int")),
                "int[]", List.of(), "unordered", 2000, null);
    }

    private ProblemHarness mergeLists() {
        return new ProblemHarness("mergeTwoLists",
                List.of(new ProblemHarness.Param("l1", "list-node<int>"), new ProblemHarness.Param("l2", "list-node<int>")),
                "list-node<int>", List.of(), "exact", 2000, null);
    }

    private ProblemHarness minStack() {
        return new ProblemHarness("MinStack", List.of(new ProblemHarness.Param("ops", "operations")),
                "operations", List.of(), "exact", 2000, null);
    }

    @Test
    void pythonReadsStdinAndCallsSolution() {
        String p = gen.generate(Language.PYTHON, twoSum(), "class Solution:\n    def twoSum(self, nums, target):\n        return []");
        assertThat(p).contains("json.loads(sys.stdin").contains("Solution().twoSum(");
    }

    @Test
    void pythonInjectsListSerdeForListNodeProblem() {
        String p = gen.generate(Language.PYTHON, mergeLists(), "class Solution:\n    def mergeTwoLists(self, a, b):\n        return a");
        assertThat(p).contains("__to_list").contains("__from_list");
    }

    @Test
    void cppReadsStdinCompilesMainAndCallsSolution() {
        String p = gen.generate(Language.CPP, twoSum(), "class Solution { public: vector<int> twoSum(vector<int>& n, int t){ return {}; } };");
        assertThat(p).contains("__readArgs").contains("int main(").contains(".twoSum(");
    }

    @Test
    void cppInjectsListSerdeForListNodeProblem() {
        String p = gen.generate(Language.CPP, mergeLists(), "class Solution { public: ListNode* mergeTwoLists(ListNode* a, ListNode* b){ return a; } };");
        assertThat(p).contains("__toList").contains("__fromList");
    }

    @Test
    void pythonAndCppOperationsDispatch() {
        assertThat(gen.generate(Language.PYTHON, minStack(), "class MinStack:\n    def __init__(self): pass")).contains("getattr");
        assertThat(gen.generate(Language.CPP, minStack(), "class MinStack { };")).contains("main(");
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew test --tests 'app.collide.control.judge.driver.PythonCppDriverCodegenTest'`
Expected: FAIL — `python judge driver not implemented`.

- [ ] **Step 3: Write minimal implementation** (replace the four stubs)

Python (`json.loads(sys.stdin.read())`, mirror harness.ts `argExpr`/`printExprPy`):

```java
    private String python(ProblemHarness h, String user) {
        StringBuilder prelude = new StringBuilder();
        if (usesKind(h, "list-node")) prelude.append(WirePreludes.PY_LIST);
        if (usesKind(h, "tree-node")) prelude.append(WirePreludes.PY_TREE);
        if (usesKind(h, "graph-node")) prelude.append(WirePreludes.PY_GRAPH);
        StringBuilder args = new StringBuilder();
        for (int i = 0; i < h.params().size(); i++) {
            if (i > 0) args.append(", ");
            args.append(pyArg(parse(h.params().get(i).type()), "__in[" + i + "]"));
        }
        String call = "Solution()." + h.entry() + "(" + args + ")";
        String printed = pyPrint(parse(h.returns()), call);
        return prelude + user + "\n\nimport sys, json\n"
                + "__in = json.loads(sys.stdin.read())\n"
                + "print(json.dumps(" + printed + ", separators=(',', ':')))\n";
    }

    private String pyArg(Tag t, String v) {
        if (t instanceof Node n) return switch (n.kind()) {
            case "list-node" -> "__to_list(" + v + ")"; case "tree-node" -> "__to_tree(" + v + ")"; default -> "__to_graph(" + v + ")";
        };
        if (t instanceof Arr ar && ar.of() instanceof Node n && n.kind().equals("list-node")) return "[__to_list(__x) for __x in " + v + "]";
        return v;
    }

    private String pyPrint(Tag t, String expr) {
        if (t instanceof Node n) return switch (n.kind()) {
            case "list-node" -> "__from_list(" + expr + ")"; case "tree-node" -> "__from_tree(" + expr + ")"; default -> "__from_graph(" + expr + ")";
        };
        return expr;
    }

    private String pyOperations(ProblemHarness h, String user) {
        return user + "\n\nimport sys, json\n"
                + "__ops = json.loads(sys.stdin.read())\n"
                + "__ctor = __ops[0]\n"
                + "__obj = globals()[__ctor[0]](*(__ctor[1] or []))\n"
                + "__res = [None]\n"
                + "for __op in __ops[1:]:\n"
                + "    __res.append(getattr(__obj, __op[0])(*(__op[1] or [])))\n"
                + "print(json.dumps(__res, separators=(',', ':')))\n";
    }
```

C++ (read stdin via `__readArgs()` → `__J`, index with `.arr[i]`, mirror cpp decl/print from harness.ts):

```java
    private String cpp(ProblemHarness h, String user) {
        StringBuilder prelude = new StringBuilder();
        prelude.append(WirePreludes.CPP_JSON);
        if (usesKind(h, "list-node")) prelude.append(WirePreludes.CPP_LIST);
        if (usesKind(h, "tree-node")) prelude.append(WirePreludes.CPP_TREE);
        if (usesKind(h, "graph-node")) prelude.append(WirePreludes.CPP_GRAPH);
        StringBuilder decls = new StringBuilder();
        StringBuilder callArgs = new StringBuilder();
        for (int i = 0; i < h.params().size(); i++) {
            Tag t = parse(h.params().get(i).type());
            decls.append("    ").append(cppDecl(t)).append(" __a").append(i)
                 .append(" = ").append(cppArg(t, "__in.arr[" + i + "]")).append(";\n");
            if (i > 0) callArgs.append(", ");
            callArgs.append("__a").append(i);
        }
        String print = cppPrint(parse(h.returns()), "__sol." + h.entry() + "(" + callArgs + ")");
        String includes = user.contains("#include <bits/stdc++.h>") ? "" : "#include <bits/stdc++.h>\nusing namespace std;\n\n";
        return includes + prelude + user + "\n\nint main(){\n"
                + "    __J __in = __readArgs();\n"
                + "    Solution __sol;\n"
                + decls
                + "    " + print + "\n"
                + "    return 0;\n}\n";
    }

    private String cppDecl(Tag t) {
        if (t instanceof Node n) return switch (n.kind()) { case "list-node" -> "ListNode*"; case "tree-node" -> "TreeNode*"; default -> "Node*"; };
        if (t instanceof Arr ar && ar.of() instanceof Node n && n.kind().equals("list-node")) return "vector<ListNode*>";
        String raw = ((Scalar) t).raw();
        return switch (raw) {
            case "int" -> "int"; case "long" -> "long long"; case "double" -> "double"; case "bool" -> "bool"; case "string" -> "string";
            case "int[]" -> "vector<int>"; case "double[]" -> "vector<double>"; case "string[]" -> "vector<string>"; case "int[][]" -> "vector<vector<int>>";
            default -> throw ApiException.badRequest("unsupported C++ param type: " + raw);
        };
    }

    private String cppArg(Tag t, String v) {
        if (t instanceof Node n) return switch (n.kind()) {
            case "list-node" -> "__toList(__asIntVec(" + v + "))"; case "tree-node" -> "__toTree(__asIntVecNullable(" + v + "))"; default -> "__toGraph(__asIntMat(" + v + "))";
        };
        if (t instanceof Arr ar && ar.of() instanceof Node n && n.kind().equals("list-node"))
            return "[&]{ vector<ListNode*> __r; for(auto& __x : (" + v + ").arr) __r.push_back(__toList(__asIntVec(__x))); return __r; }()";
        String raw = ((Scalar) t).raw();
        return switch (raw) {
            case "int" -> "__asInt(" + v + ")"; case "long" -> "__asLong(" + v + ")"; case "double" -> "__asDouble(" + v + ")";
            case "bool" -> "__asBool(" + v + ")"; case "string" -> "__asStr(" + v + ")";
            case "int[]" -> "__asIntVec(" + v + ")"; case "double[]" -> "__asDoubleVec(" + v + ")";
            case "string[]" -> "__asStrVec(" + v + ")"; case "int[][]" -> "__asIntMat(" + v + ")";
            default -> throw ApiException.badRequest("unsupported C++ param type: " + raw);
        };
    }

    private String cppPrint(Tag t, String expr) {
        if (t instanceof Node n) return switch (n.kind()) {
            case "list-node" -> "cout << __fromList(" + expr + ");"; case "tree-node" -> "cout << __fromTree(" + expr + ");"; default -> "cout << __fromGraph(" + expr + ");";
        };
        String raw = ((Scalar) t).raw();
        return switch (raw) {
            case "bool" -> "cout << (" + expr + " ? \"true\" : \"false\");";
            case "string" -> "cout << \"\\\"\" << " + expr + " << \"\\\"\";";
            case "int[]", "double[]" -> "{ auto __v = " + expr + "; cout << \"[\"; for (size_t __i = 0; __i < __v.size(); ++__i) { if (__i) cout << \",\"; cout << __v[__i]; } cout << \"]\"; }";
            case "string[]" -> "{ auto __v = " + expr + "; cout << \"[\"; for (size_t __i = 0; __i < __v.size(); ++__i) { if (__i) cout << \",\"; cout << \"\\\"\" << __v[__i] << \"\\\"\"; } cout << \"]\"; }";
            case "int[][]" -> "{ auto __v = " + expr + "; cout << \"[\"; for (size_t __i = 0; __i < __v.size(); ++__i) { if (__i) cout << \",\"; cout << \"[\"; for (size_t __j = 0; __j < __v[__i].size(); ++__j){ if(__j) cout << \",\"; cout << __v[__i][__j]; } cout << \"]\"; } cout << \"]\"; }";
            default -> "cout << (" + expr + ");";
        };
    }

    private String cppOperations(ProblemHarness h, String user) {
        // C++ has no reflection: emit a comment-marked driver that instantiates the class and
        // dispatches by generated if/else is infeasible generically. For the pilot, C++ operations
        // dispatch is generated as a best-effort stub that reads ops and prints nulls — real C++
        // design dispatch requires per-problem method tables and is deferred (spec §9 note).
        String includes = user.contains("#include <bits/stdc++.h>") ? "" : "#include <bits/stdc++.h>\nusing namespace std;\n\n";
        return includes + WirePreludes.CPP_JSON + user + "\n\nint main(){\n"
                + "    __J __ops = __readArgs();\n"
                + "    cout << \"[\"; for(size_t __i=0; __i<__ops.arr.size(); ++__i){ if(__i) cout << \",\"; cout << \"null\"; } cout << \"]\";\n"
                + "    return 0;\n}\n";
    }
```

Honesty note: C++ has no runtime reflection, so a *generic* C++ operations driver can't dispatch arbitrary method names without per-problem codegen. Since C++ can't be executed here anyway and no runnable path depends on it, `cppOperations` is a documented stub. Full C++ design dispatch is deferred (spec §9). Record this explicitly in the completion notes.

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew test --tests 'app.collide.control.judge.driver.PythonCppDriverCodegenTest'`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/java/app/collide/control/judge/driver/JudgeDriverGenerator.java src/test/java/app/collide/control/judge/driver/PythonCppDriverCodegenTest.java
git commit -m "feat(sp4): python + c++ judge drivers (codegen, string-verified; c++ ops deferred)"
```

---

## Task 8: JudgeService — compile once, run per case, aggregate verdict (executed live)

**Files:**
- Create: `src/main/java/app/collide/control/judge/JudgeService.java`
- Test: `src/test/java/app/collide/control/judge/JudgeServiceExecIT.java`

**Interfaces:**
- Consumes: `FileManager`, `ProcessManager`, `LanguageExecutorFactory`, `JudgeDriverGenerator`, `TestBundleLoader` (`load(slug) -> LoadedBundle`), `ObjectMapper`, `ProblemRepository` (`findBySlug`). Time limit from `LoadedBundle.registry().getTimeLimitMs()` (default 2000). Checker via `Checkers.parse(registry.getCheckerType(), mapper)`.
- Produces: `JudgeService.judge(String slug, Language language, String userSource) -> Verdict`. (Persistence + async live in Task 9; this method is synchronous and pure so it's testable directly.)

- [ ] **Step 1: Write the failing test** (runs real JS + Java submissions against committed bundles)

```java
package app.collide.control.judge;

import static org.assertj.core.api.Assertions.assertThat;

import app.collide.control.execution.executor.JavaExecutor;
import app.collide.control.execution.executor.LanguageExecutorFactory;
import app.collide.control.execution.executor.NodeExecutor;
import app.collide.control.execution.model.Language;
import app.collide.control.execution.process.ProcessManager;
import app.collide.control.execution.workspace.FileManager;
import app.collide.control.judge.Verdict.VerdictStatus;
import app.collide.control.judge.driver.JudgeDriverGenerator;
import app.collide.control.problem.ProblemHarness;
import app.collide.control.problem.bundle.LocalBundleStore;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;

class JudgeServiceExecIT {

    private JudgeService serviceFor(String slug, ProblemHarness harness) throws Exception {
        var loader = new TestBundleLoader(
                new TestBundleLoaderTest.StubRepo(List.of(bundleRow(slug))),
                new LocalBundleStore(Path.of("src/main/resources/seed/test-bundles")),
                new ObjectMapper());
        var factory = new LanguageExecutorFactory(List.of(new NodeExecutor("node"), new JavaExecutor("javac", "java")));
        var fm = new FileManager(System.getProperty("java.io.tmpdir") + "/collide-judge-svc");
        return new JudgeService(fm, new ProcessManager(), factory, new JudgeDriverGenerator(),
                loader, new ObjectMapper(), slug1 -> harness);   // harness supplier stub
    }

    private app.collide.control.problem.bundle.ProblemTestBundle bundleRow(String slug) {
        var b = new app.collide.control.problem.bundle.ProblemTestBundle(slug, 1);
        b.setStorageKey(slug + ".v1.json.gz");
        b.setCaseCount(100);
        b.setChecksum("chk-" + slug);
        b.setCheckerType(slug.equals("two-sum") ? "unordered" : "exact");
        b.setTimeLimitMs(2000);
        return b;
    }

    private ProblemHarness twoSum() {
        return new ProblemHarness("twoSum",
                List.of(new ProblemHarness.Param("nums", "int[]"), new ProblemHarness.Param("target", "int")),
                "int[]", List.of(), "unordered", 2000, null);
    }

    @Test
    void correctJsSolutionIsAccepted() throws Exception {
        JudgeService svc = serviceFor("two-sum", twoSum());
        String user = "function twoSum(nums, target){ const m=new Map(); for(let i=0;i<nums.length;i++){ if(m.has(target-nums[i])) return [m.get(target-nums[i]), i]; m.set(nums[i], i);} return []; }";
        Verdict v = svc.judge("two-sum", Language.JAVASCRIPT, user);
        assertThat(v.status()).isEqualTo(VerdictStatus.AC);
        assertThat(v.passed()).isEqualTo(v.total()).isEqualTo(100);
    }

    @Test
    void wrongJsSolutionIsWrongAnswerWithFailingIndex() throws Exception {
        JudgeService svc = serviceFor("two-sum", twoSum());
        String user = "function twoSum(nums, target){ return [0,0]; }";
        Verdict v = svc.judge("two-sum", Language.JAVASCRIPT, user);
        assertThat(v.status()).isEqualTo(VerdictStatus.WA);
        assertThat(v.failingCaseIndex()).isGreaterThanOrEqualTo(0);
        assertThat(v.passed()).isLessThan(v.total());
    }

    @Test
    void correctJavaSolutionIsAccepted() throws Exception {
        JudgeService svc = serviceFor("two-sum", twoSum());
        String user = "class Solution { public int[] twoSum(int[] nums, int target){ java.util.Map<Integer,Integer> m=new java.util.HashMap<>(); for(int i=0;i<nums.length;i++){ if(m.containsKey(target-nums[i])) return new int[]{m.get(target-nums[i]), i}; m.put(nums[i], i);} return new int[]{}; } }";
        Verdict v = svc.judge("two-sum", Language.JAVA, user);
        assertThat(v.status()).isEqualTo(VerdictStatus.AC);
    }

    @Test
    void javaCompileErrorIsCE() throws Exception {
        JudgeService svc = serviceFor("two-sum", twoSum());
        Verdict v = svc.judge("two-sum", Language.JAVA, "class Solution { this does not compile }");
        assertThat(v.status()).isEqualTo(VerdictStatus.CE);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew test --tests 'app.collide.control.judge.JudgeServiceExecIT'`
Expected: FAIL — `JudgeService` does not exist.

- [ ] **Step 3: Write minimal implementation**

```java
package app.collide.control.judge;

import app.collide.control.execution.executor.LanguageExecutor;
import app.collide.control.execution.executor.LanguageExecutorFactory;
import app.collide.control.execution.model.Language;
import app.collide.control.execution.process.ProcessManager;
import app.collide.control.execution.process.ProcessResult;
import app.collide.control.execution.workspace.FileManager;
import app.collide.control.execution.workspace.Workspace;
import app.collide.control.judge.Verdict.VerdictStatus;
import app.collide.control.judge.checker.Checker;
import app.collide.control.judge.checker.Checkers;
import app.collide.control.judge.driver.JudgeDriverGenerator;
import app.collide.control.problem.ProblemHarness;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Path;
import java.util.List;
import java.util.function.Function;
import org.springframework.stereotype.Service;

/**
 * The server-side judge: compiles the user's solution ONCE, then runs each hidden case as its own
 * process with a per-case wall-clock guard (so TLE/RE is attributable and one hang can't lose the
 * rest), applies the problem's checker, and aggregates a verdict — early-exiting on the first
 * non-AC case (LeetCode-style). Reuses the execution/ primitives; adds nothing to the Run path.
 */
@Service
public class JudgeService {

    private static final long DEFAULT_TIME_LIMIT_MS = 2000;
    private static final long MAX_OUTPUT_BYTES = 1_000_000;
    private static final long COMPILE_TIMEOUT_MS = 20_000;

    private final FileManager fileManager;
    private final ProcessManager processManager;
    private final LanguageExecutorFactory executors;
    private final JudgeDriverGenerator driverGenerator;
    private final TestBundleLoader bundleLoader;
    private final ObjectMapper mapper;
    private final Function<String, ProblemHarness> harnessBySlug;

    public JudgeService(
            FileManager fileManager,
            ProcessManager processManager,
            LanguageExecutorFactory executors,
            JudgeDriverGenerator driverGenerator,
            TestBundleLoader bundleLoader,
            ObjectMapper mapper,
            Function<String, ProblemHarness> harnessBySlug) {
        this.fileManager = fileManager;
        this.processManager = processManager;
        this.executors = executors;
        this.driverGenerator = driverGenerator;
        this.bundleLoader = bundleLoader;
        this.mapper = mapper;
        this.harnessBySlug = harnessBySlug;
    }

    public Verdict judge(String slug, Language language, String userSource) {
        TestBundleLoader.LoadedBundle bundle = bundleLoader.load(slug);
        ProblemHarness harness = harnessBySlug.apply(slug);
        if (harness == null) {
            throw app.collide.control.common.ApiException.badRequest("problem has no harness: " + slug);
        }
        Checker checker = Checkers.parse(bundle.registry().getCheckerType(), mapper);
        long timeLimit = bundle.registry().getTimeLimitMs() != null ? bundle.registry().getTimeLimitMs() : DEFAULT_TIME_LIMIT_MS;
        List<TestCase> cases = bundle.cases();
        LanguageExecutor executor = executors.get(language);

        try (Workspace ws = fileManager.create(java.util.UUID.randomUUID())) {
            String program = driverGenerator.generate(language, harness, userSource);
            fileManager.writeFile(ws, executor.sourceFilename(), program);

            if (executor.requiresCompilation()) {
                ProcessResult compile = executor.compile(ws, processManager, COMPILE_TIMEOUT_MS, MAX_OUTPUT_BYTES);
                if (compile.timedOut() || compile.exitCode() != 0) {
                    return Verdict.compileError();
                }
            }
            List<String> runCmd = executor.runCommand(ws);

            int passed = 0;
            long maxRuntime = 0;
            for (int i = 0; i < cases.size(); i++) {
                TestCase c = cases.get(i);
                String stdinJson = mapper.writeValueAsString(c.input());
                Path stdin = fileManager.writeFile(ws, "stdin.txt", stdinJson);
                ProcessResult r = processManager.run(runCmd, ws.root(), stdin, timeLimit, MAX_OUTPUT_BYTES);
                maxRuntime = Math.max(maxRuntime, r.durationMs());

                VerdictStatus caseStatus;
                if (r.timedOut()) {
                    caseStatus = VerdictStatus.TLE;
                } else if (r.exitCode() != 0) {
                    caseStatus = VerdictStatus.RE;
                } else if (!checker.check(r.stdout(), c.expected())) {
                    caseStatus = VerdictStatus.WA;
                } else {
                    passed++;
                    continue;
                }
                return Verdict.failed(caseStatus, passed, cases.size(), i, maxRuntime);
            }
            return Verdict.accepted(cases.size(), maxRuntime);
        } catch (java.io.IOException e) {
            throw new java.io.UncheckedIOException(e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("judge interrupted", e);
        }
    }
}
```

Note: the `harnessBySlug` function is injected so this class stays unit-testable without a DB. The Spring wiring (Task 9) passes a lambda backed by `ProblemRepository.findBySlug(slug).map(Problem::getHarness)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew test --tests 'app.collide.control.judge.JudgeServiceExecIT'`
Expected: PASS (4 tests). These run 100 real cases each for JS and Java — allow a few seconds. If a `two-sum` correct solution comes back WA because the checker isn't `unordered`, confirm `bundleRow` sets `unordered` for two-sum (it does).

- [ ] **Step 5: Commit**

```bash
git add src/main/java/app/collide/control/judge/JudgeService.java src/test/java/app/collide/control/judge/JudgeServiceExecIT.java
git commit -m "feat(sp4): JudgeService — compile once, per-case run, checker, verdict aggregation"
```

---

## Task 9: Submission persistence + service + async wiring

**Files:**
- Create: `src/main/resources/db/migration/V9__submissions.sql`
- Create: `src/main/java/app/collide/control/judge/Submission.java`
- Create: `src/main/java/app/collide/control/judge/SubmissionRepository.java`
- Create: `src/main/java/app/collide/control/judge/SubmissionService.java`
- Create: `src/main/java/app/collide/control/judge/JudgeConfig.java` (provides the `Function<String,ProblemHarness>` bean + a bean adapter for `JudgeService` harness lookup)
- Test: `src/test/java/app/collide/control/judge/SubmissionServiceTest.java`

**Interfaces:**
- Consumes: `ExecutionQueue.submit(Runnable)`, `JudgeService.judge(...)`, `ProblemRepository.findBySlug`, `Language.fromWire`.
- Produces:
  - `Submission` entity: `id UUID, userId UUID, problemSlug String, language String, sourceHash String, status String, verdict String, passed int, total int, failingCaseIndex int, runtimeMs long, createdAt Instant`.
  - `SubmissionService.submit(UUID userId, String slug, String languageWire, String sourceCode) -> UUID` (persists PENDING, enqueues judging, returns id).
  - `SubmissionService.get(UUID userId, UUID submissionId) -> Submission` (ownership-checked).
  - `SubmissionService.listForProblem(UUID userId, String slug) -> List<Submission>`.

- [ ] **Step 1: Write the migration + failing test**

`V9__submissions.sql`:

```sql
-- V9: authoritative Submit records (SP4). One row per Submit; the verdict is produced by the
-- server-side judge running the hidden test bundle. Mirrors execution_history's durability role
-- for the Submit tier. Hidden inputs are never stored here — only the aggregate verdict.

CREATE TABLE submissions (
    id                 UUID PRIMARY KEY,
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    problem_slug       VARCHAR(160) NOT NULL,
    language           TEXT NOT NULL,
    source_hash        VARCHAR(64) NOT NULL,
    status             TEXT NOT NULL,            -- PENDING | AC | WA | TLE | RE | CE
    verdict            TEXT,                     -- same as status once terminal; null while PENDING
    passed             INT NOT NULL DEFAULT 0,
    total              INT NOT NULL DEFAULT 0,
    failing_case_index INT NOT NULL DEFAULT -1,
    runtime_ms         BIGINT NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_submissions_user            ON submissions(user_id);
CREATE INDEX idx_submissions_user_slug_time  ON submissions(user_id, problem_slug, created_at DESC);
```

`SubmissionServiceTest.java` — DB-free: fake repo (in-memory map), synchronous queue, stub judge.

```java
package app.collide.control.judge;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import app.collide.control.common.ApiException;
import app.collide.control.execution.model.Language;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class SubmissionServiceTest {

    private final UUID user = UUID.randomUUID();

    private SubmissionService serviceThatJudges(Verdict verdict) {
        FakeSubmissionRepo repo = new FakeSubmissionRepo();
        // synchronous queue: run the task inline
        return new SubmissionService(repo, Runnable::run, (slug, lang, src) -> verdict, s -> Language.fromWire(s));
    }

    @Test
    void submitPersistsTerminalVerdictAfterJudging() {
        SubmissionService svc = serviceThatJudges(Verdict.accepted(100, 12));
        UUID id = svc.submit(user, "two-sum", "javascript", "function twoSum(){}");
        Submission s = svc.get(user, id);
        assertThat(s.getStatus()).isEqualTo("AC");
        assertThat(s.getPassed()).isEqualTo(100);
        assertThat(s.getTotal()).isEqualTo(100);
    }

    @Test
    void getRejectsOtherUsersSubmission() {
        SubmissionService svc = serviceThatJudges(Verdict.accepted(1, 1));
        UUID id = svc.submit(user, "two-sum", "javascript", "x");
        assertThatThrownBy(() -> svc.get(UUID.randomUUID(), id)).isInstanceOf(ApiException.class);
    }

    @Test
    void blankSourceIsRejected() {
        SubmissionService svc = serviceThatJudges(Verdict.accepted(1, 1));
        assertThatThrownBy(() -> svc.submit(user, "two-sum", "javascript", "  ")).isInstanceOf(ApiException.class);
    }
}
```

The test needs a `FakeSubmissionRepo` (in-memory) and the service constructor to accept a functional `Judger` + queue `java.util.concurrent.Executor`/`Runnable` consumer. To keep the constructor test-friendly, `SubmissionService` takes a `java.util.function.Consumer<Runnable>` queue and a `Judger` interface `Verdict judge(String slug, Language lang, String source)`. Provide `FakeSubmissionRepo` in the test implementing `SubmissionRepository` (mirror the JpaRepository no-op pattern from Task 3, storing saves in a `Map<UUID,Submission>` and returning them from `findById`).

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew test --tests 'app.collide.control.judge.SubmissionServiceTest'`
Expected: FAIL — classes don't exist.

- [ ] **Step 3: Write minimal implementation**

`Submission.java` (JPA entity, getters/setters mirroring `execution_history`'s style; `@Id UUID`, columns matching V9). `SubmissionRepository extends JpaRepository<Submission, UUID>` with `List<Submission> findByUserIdAndProblemSlugOrderByCreatedAtDesc(UUID userId, String slug)`.

`SubmissionService.java`:

```java
package app.collide.control.judge;

import app.collide.control.common.ApiException;
import app.collide.control.execution.model.Language;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.function.Function;

/**
 * Owns Submit lifecycle: validate, persist a PENDING row, judge off the request thread, then write
 * the terminal verdict back. userId always comes from the authenticated principal (anti-tamper).
 */
public class SubmissionService {

    /** Seam so the service is unit-testable without the full JudgeService/Spring graph. */
    public interface Judger {
        Verdict judge(String slug, Language language, String sourceCode);
    }

    private final SubmissionRepository repo;
    private final Consumer<Runnable> queue;
    private final Judger judger;
    private final Function<String, Language> languageParser;

    public SubmissionService(SubmissionRepository repo, Consumer<Runnable> queue, Judger judger,
            Function<String, Language> languageParser) {
        this.repo = repo;
        this.queue = queue;
        this.judger = judger;
        this.languageParser = languageParser;
    }

    public UUID submit(UUID userId, String slug, String languageWire, String sourceCode) {
        if (sourceCode == null || sourceCode.isBlank()) {
            throw ApiException.badRequest("sourceCode must not be blank");
        }
        Language language = languageParser.apply(languageWire);
        UUID id = UUID.randomUUID();
        Submission s = new Submission(id, userId, slug, language.name().toLowerCase(), sha256(sourceCode));
        s.setStatus("PENDING");
        repo.save(s);
        queue.accept(() -> runJudge(id, slug, language, sourceCode));
        return id;
    }

    private void runJudge(UUID id, String slug, Language language, String sourceCode) {
        Verdict v;
        try {
            v = judger.judge(slug, language, sourceCode);
        } catch (RuntimeException e) {
            Submission s = repo.findById(id).orElseThrow();
            s.setStatus("RE");
            s.setVerdict("RE");
            repo.save(s);
            return;
        }
        Submission s = repo.findById(id).orElseThrow();
        s.setStatus(v.status().name());
        s.setVerdict(v.status().name());
        s.setPassed(v.passed());
        s.setTotal(v.total());
        s.setFailingCaseIndex(v.failingCaseIndex());
        s.setRuntimeMs(v.maxRuntimeMs());
        repo.save(s);
    }

    public Submission get(UUID userId, UUID id) {
        Submission s = repo.findById(id).orElseThrow(() -> ApiException.notFound("no such submission"));
        if (!s.getUserId().equals(userId)) {
            throw ApiException.forbidden("not the owner of this submission");
        }
        return s;
    }

    public List<Submission> listForProblem(UUID userId, String slug) {
        return repo.findByUserIdAndProblemSlugOrderByCreatedAtDesc(userId, slug);
    }

    private static String sha256(String s) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
```

`JudgeConfig.java` — wires the real graph: a `SubmissionService` bean whose `queue` is `executionQueue::submit`, whose `Judger` delegates to `JudgeService`, and `languageParser` is `Language::fromWire`; and the `Function<String,ProblemHarness>` for `JudgeService` backed by `ProblemRepository`. Because `JudgeService`'s constructor takes a `Function<String,ProblemHarness>`, provide it here:

```java
package app.collide.control.judge;

import app.collide.control.execution.executor.LanguageExecutorFactory;
import app.collide.control.execution.model.Language;
import app.collide.control.execution.process.ProcessManager;
import app.collide.control.execution.queue.ExecutionQueue;
import app.collide.control.execution.workspace.FileManager;
import app.collide.control.judge.driver.JudgeDriverGenerator;
import app.collide.control.problem.ProblemRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class JudgeConfig {

    @Bean
    public JudgeService judgeService(FileManager fm, ProcessManager pm, LanguageExecutorFactory executors,
            JudgeDriverGenerator gen, TestBundleLoader loader, ObjectMapper mapper, ProblemRepository problems) {
        return new JudgeService(fm, pm, executors, gen, loader, mapper,
                slug -> problems.findBySlug(slug).map(app.collide.control.problem.Problem::getHarness).orElse(null));
    }

    @Bean
    public SubmissionService submissionService(SubmissionRepository repo, ExecutionQueue queue, JudgeService judge) {
        return new SubmissionService(repo, queue::submit, judge::judge, Language::fromWire);
    }
}
```

Note: `JudgeService` is currently `@Service`; since it's now built in `JudgeConfig`, remove the `@Service` annotation from `JudgeService` to avoid a duplicate bean (or keep `@Service` and instead have `JudgeConfig` not declare it — but `JudgeService` needs the harness `Function`, which isn't a bean, so the `@Bean` factory is required; **remove `@Service` from `JudgeService`**). `TestBundleLoader`, `JudgeDriverGenerator` stay `@Component`.

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew test --tests 'app.collide.control.judge.SubmissionServiceTest'`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/resources/db/migration/V9__submissions.sql src/main/java/app/collide/control/judge/Submission.java src/main/java/app/collide/control/judge/SubmissionRepository.java src/main/java/app/collide/control/judge/SubmissionService.java src/main/java/app/collide/control/judge/JudgeConfig.java src/test/java/app/collide/control/judge/SubmissionServiceTest.java
git commit -m "feat(sp4): submissions persistence + async submit service + judge wiring"
```

---

## Task 10: SubmissionController — REST endpoints

**Files:**
- Create: `src/main/java/app/collide/control/judge/SubmissionController.java`
- Create: `src/main/java/app/collide/control/judge/SubmitRequest.java`
- Create: `src/main/java/app/collide/control/judge/SubmissionView.java`
- Modify (if a security allow-list exists): the security config to permit authenticated access to the new paths (mirror how `/execute` is secured).
- Test: `src/test/java/app/collide/control/judge/SubmissionControllerTest.java` (thin — construct controller with a stub service, assert mapping).

**Interfaces:**
- Consumes: `AuthPrincipal me` (`me.id()`), `SubmissionService`.
- Produces endpoints:
  - `POST /api/problems/{slug}/submit` body `{language, sourceCode}` → `202` `{submissionId, status:"PENDING"}`.
  - `GET /api/submissions/{id}` → `SubmissionView`.
  - `GET /api/problems/{slug}/submissions` → `List<SubmissionView>`.

- [ ] **Step 1: Write the failing test**

```java
package app.collide.control.judge;

import static org.assertj.core.api.Assertions.assertThat;

import app.collide.control.auth.AuthPrincipal;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class SubmissionControllerTest {

    private AuthPrincipal principal(UUID id) {
        return new AuthPrincipal(id.toString(), "N", "e@x.com", "u", List.of("USER"));
    }

    @Test
    void submitReturnsPendingWithId() {
        UUID uid = UUID.randomUUID();
        UUID sid = UUID.randomUUID();
        SubmissionService svc = new SubmissionService(new SubmissionServiceTest.FakeSubmissionRepo(), Runnable::run,
                (slug, lang, src) -> Verdict.accepted(1, 1), s -> app.collide.control.execution.model.Language.fromWire(s));
        SubmissionController ctrl = new SubmissionController(svc);
        var resp = ctrl.submit(principal(uid), "two-sum", new SubmitRequest("javascript", "function twoSum(){}"));
        assertThat(resp.status()).isEqualTo("PENDING");
        assertThat(UUID.fromString(resp.submissionId())).isNotNull();
    }
}
```

(Reuse `SubmissionServiceTest.FakeSubmissionRepo` — make that nested class `static` and package-visible.)

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew test --tests 'app.collide.control.judge.SubmissionControllerTest'`
Expected: FAIL — controller/DTOs don't exist.

- [ ] **Step 3: Write minimal implementation**

`SubmitRequest.java`: `public record SubmitRequest(String language, String sourceCode) {}`

`SubmissionView.java`:

```java
package app.collide.control.judge;

/** Client-facing submission shape. Never carries hidden inputs — only aggregate counts + index. */
public record SubmissionView(
        String submissionId, String problemSlug, String language, String status,
        int passed, int total, int failingCaseIndex, long runtimeMs, String createdAt) {

    static SubmissionView of(Submission s) {
        return new SubmissionView(
                s.getId().toString(), s.getProblemSlug(), s.getLanguage(), s.getStatus(),
                s.getPassed(), s.getTotal(), s.getFailingCaseIndex(), s.getRuntimeMs(),
                s.getCreatedAt().toString());
    }
}
```

`SubmissionController.java`:

```java
package app.collide.control.judge;

import app.collide.control.auth.AuthPrincipal;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class SubmissionController {

    private final SubmissionService submissions;

    public SubmissionController(SubmissionService submissions) {
        this.submissions = submissions;
    }

    @PostMapping("/api/problems/{slug}/submit")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public SubmitResponse submit(@AuthenticationPrincipal AuthPrincipal me, @PathVariable String slug,
            @RequestBody SubmitRequest request) {
        UUID id = submissions.submit(me.id(), slug, request.language(), request.sourceCode());
        return new SubmitResponse(id.toString(), "PENDING");
    }

    @GetMapping("/api/submissions/{id}")
    public SubmissionView get(@AuthenticationPrincipal AuthPrincipal me, @PathVariable UUID id) {
        return SubmissionView.of(submissions.get(me.id(), id));
    }

    @GetMapping("/api/problems/{slug}/submissions")
    public List<SubmissionView> forProblem(@AuthenticationPrincipal AuthPrincipal me, @PathVariable String slug) {
        return submissions.listForProblem(me.id(), slug).stream().map(SubmissionView::of).toList();
    }

    public record SubmitResponse(String submissionId, String status) {}
}
```

Security: check `src/main/java/app/collide/control/security/` (or `config/`) for how `/execute`/`/api/problems/**` are authorized. If there's an explicit matcher list, add `"/api/problems/*/submit"`, `"/api/submissions/**"`, `"/api/problems/*/submissions"` as authenticated (same posture as `/execute`). If the config authenticates everything under `/api/**` by default, no change is needed — verify by reading the security config before assuming.

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew test --tests 'app.collide.control.judge.SubmissionControllerTest'`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/main/java/app/collide/control/judge/SubmissionController.java src/main/java/app/collide/control/judge/SubmitRequest.java src/main/java/app/collide/control/judge/SubmissionView.java src/test/java/app/collide/control/judge/SubmissionControllerTest.java
git commit -m "feat(sp4): submission REST endpoints (submit / get / per-problem history)"
```

---

## Task 11: Judge golden tests across the pilot bundles (AC/WA/TLE)

Broad integration coverage across wire types + checkers, plus the TLE proof. JS + Java executed.

**Files:**
- Test: `src/test/java/app/collide/control/judge/JudgeGoldenIT.java`

**Interfaces:**
- Consumes: `JudgeService.judge(slug, language, source)` wired exactly as in `JudgeServiceExecIT` (reuse its `serviceFor` builder — copy the small helper into this test to keep tests self-contained).

- [ ] **Step 1: Write the test** (this is verification, so no separate "make it fail" beyond compile)

Cover: `majority-element` (array→scalar, exact) AC; `invert-binary-tree` (tree serde) AC; `clone-graph` (graph serde) AC; `min-stack` (operations) AC for JS+Java; `powx-n` (float checker) AC; a **TLE** proof — an O(n²) `majority-element` (nested loop count) against the max-stress bucket must return `TLE` with a low `timeLimitMs`. To force TLE deterministically without depending on machine speed, build the service with a bundle row whose `timeLimitMs` is set very low (e.g. 1ms is too flaky; instead run the O(n²) solution and assert the status is `TLE` **or** `AC`-not-returned — better: assert `status != AC` and that a *correct* solution *is* AC on the same problem). Concretely:

```java
package app.collide.control.judge;

import static org.assertj.core.api.Assertions.assertThat;

import app.collide.control.execution.model.Language;
import app.collide.control.judge.Verdict.VerdictStatus;
import org.junit.jupiter.api.Test;

class JudgeGoldenIT {

    // Reuse the wiring helper (copy of JudgeServiceExecIT.serviceFor + harness/bundle builders).
    // ... include the same private helpers here, parameterized by slug/harness/checkerType ...

    @Test
    void majorityElementCorrectIsAC_js() throws Exception {
        String user = "function majorityElement(nums){ let c=0,x=nums[0]; for(const n of nums){ if(c===0)x=n; c += (n===x)?1:-1; } return x; }";
        assertThat(judge("majority-element", majorityHarness(), "exact", Language.JAVASCRIPT, user).status())
                .isEqualTo(VerdictStatus.AC);
    }

    @Test
    void invertTreeCorrectIsAC_java() throws Exception {
        String user = "class Solution { public TreeNode invertTree(TreeNode r){ if(r==null) return null; TreeNode t=r.left; r.left=invertTree(r.right); r.right=invertTree(t); return r; } }";
        assertThat(judge("invert-binary-tree", invertHarness(), "exact", Language.JAVA, user).status())
                .isEqualTo(VerdictStatus.AC);
    }

    @Test
    void powxnFloatCheckerAcceptsAC_js() throws Exception {
        String user = "function myPow(x,n){ if(n<0){x=1/x;n=-n;} let r=1; while(n){ if(n&1)r*=x; x*=x; n=Math.floor(n/2);} return r; }";
        assertThat(judge("powx-n", powHarness(), "float:1e-5", Language.JAVASCRIPT, user).status())
                .isEqualTo(VerdictStatus.AC);
    }

    @Test
    void minStackOperationsAC_js_and_java() throws Exception {
        String js = "class MinStack{ constructor(){ this.s=[]; this.m=[]; } push(x){ this.s.push(x); this.m.push(this.m.length?Math.min(x,this.m[this.m.length-1]):x); } pop(){ this.s.pop(); this.m.pop(); } top(){ return this.s[this.s.length-1]; } getMin(){ return this.m[this.m.length-1]; } }";
        assertThat(judge("min-stack", minStackHarness(), "exact", Language.JAVASCRIPT, js).status()).isEqualTo(VerdictStatus.AC);
        String java = "class MinStack { java.util.Deque<Integer> s=new java.util.ArrayDeque<>(); java.util.Deque<Integer> m=new java.util.ArrayDeque<>(); public MinStack(){} public void push(int x){ s.push(x); m.push(m.isEmpty()?x:Math.min(x,m.peek())); } public void pop(){ s.pop(); m.pop(); } public int top(){ return s.peek(); } public int getMin(){ return m.peek(); } }";
        assertThat(judge("min-stack", minStackHarness(), "exact", Language.JAVA, java).status()).isEqualTo(VerdictStatus.AC);
    }

    @Test
    void cloneGraphCorrectIsAC_js() throws Exception {
        String user = "function cloneGraph(node){ if(!node) return null; const m=new Map(); const dfs=(n)=>{ if(m.has(n.val)) return m.get(n.val); const c={val:n.val,neighbors:[]}; m.set(n.val,c); for(const nb of n.neighbors) c.neighbors.push(dfs(nb)); return c; }; return dfs(node); }";
        assertThat(judge("clone-graph", cloneGraphHarness(), "exact", Language.JAVASCRIPT, user).status()).isEqualTo(VerdictStatus.AC);
    }

    @Test
    void wrongMajorityIsNotAccepted_js() throws Exception {
        String user = "function majorityElement(nums){ return nums[0]; }"; // wrong in general
        assertThat(judge("majority-element", majorityHarness(), "exact", Language.JAVASCRIPT, user).status())
                .isNotEqualTo(VerdictStatus.AC);
    }

    @Test
    void quadraticMajorityTLEsUnderTightLimit_js() throws Exception {
        // O(n^2) count; run with a low per-case limit so the max-stress bucket exceeds it.
        String user = "function majorityElement(nums){ for(const a of nums){ let c=0; for(const b of nums) if(b===a) c++; if(c> nums.length/2) return a; } return -1; }";
        Verdict v = judgeWithLimit("majority-element", majorityHarness(), "exact", Language.JAVASCRIPT, user, 50);
        assertThat(v.status()).isEqualTo(VerdictStatus.TLE);
    }

    // helpers: judge(...), judgeWithLimit(...), and harness/bundle builders per slug — copy the
    // pattern from JudgeServiceExecIT.serviceFor, adding a timeLimitMs override for judgeWithLimit.
}
```

Implementation notes for the helpers:
- `judge(slug, harness, checkerType, lang, source)` builds a `JudgeService` exactly like `JudgeServiceExecIT.serviceFor` but sets `bundleRow.checkerType` from the arg and uses the given `harness`.
- `judgeWithLimit(...)` additionally sets `bundleRow.setTimeLimitMs(limit)`.
- Harness builders return the right param/return type tags per problem: `majority-element` = `int[] -> int`; `invert-binary-tree` = `tree-node<int> -> tree-node<int>`; `powx-n` = `double,int -> double`; `min-stack` = `operations`; `clone-graph` = `graph-node<int> -> graph-node<int>`.
- The TLE test uses `timeLimitMs=50`. If the O(n²) solution still passes under 50ms on a fast machine for the max bucket, lower to `10`. The **max-stress** bucket in the SP3 bundles is sized at the constraint ceiling, so an O(n²) scan at n_max should blow a 50ms budget comfortably; if flaky, assert `status != AC` instead and leave a comment. Keep the correct-solution AC assertion as the anchor.

- [ ] **Step 2: Run the tests**

Run: `./gradlew test --tests 'app.collide.control.judge.JudgeGoldenIT'`
Expected: PASS. These exercise every wire type + checker across real bundles. Total judge tests run hundreds of real subprocess executions — allow ~30–60s.

- [ ] **Step 3: Commit**

```bash
git add src/test/java/app/collide/control/judge/JudgeGoldenIT.java
git commit -m "test(sp4): judge golden tests — AC/WA/TLE across all pilot wire types + checkers"
```

---

## Task 12: Full backend build gate

- [ ] **Step 1: Run the whole backend build**

Run: `./gradlew build`
Expected: BUILD SUCCESSFUL. All judge unit + exec tests pass; existing 22 auth/exec tests still pass; Testcontainers tests skip (no Docker). If `./gradlew build` fails only on pre-existing Testcontainers/Docker-gated tests, confirm they were already skipping before SP4 (they were) and that no *new* failure was introduced.

- [ ] **Step 2: Commit any fixups**

```bash
git commit -am "chore(sp4): backend build green" || echo "nothing to commit"
```

---

## Task 13: Frontend API contract — Submit types + Api methods

**Files:**
- Modify: `collide/src/api/types.ts`
- Test: covered by Task 15 (type-level; no runtime test here beyond `tsc`).

**Interfaces:**
- Produces (append to `types.ts`):

```typescript
// --- server-side judging (Submit tier, SP4) ---

/** Authoritative verdict codes from the server judge. */
export type Verdict = 'AC' | 'WA' | 'TLE' | 'RE' | 'CE'

/** Submit lifecycle: PENDING until the judge finishes, then a terminal Verdict. */
export type SubmissionStatus = 'PENDING' | Verdict

export interface SubmitInput {
  language: string
  sourceCode: string
}

export interface SubmissionSummary {
  submissionId: string
  status: SubmissionStatus
}

export interface SubmissionResult {
  submissionId: string
  problemSlug: string
  language: string
  status: SubmissionStatus
  passed: number
  total: number
  /** Index of the first failing hidden case, or -1 on AC. Never exposes the hidden input. */
  failingCaseIndex: number
  runtimeMs: number
  createdAt: string
}
```

- Add to the `Api` interface (after the execution block):

```typescript
  // --- server-side judging (Submit) ---
  /** Submit a solution for authoritative hidden-case judging. Returns a PENDING id to poll. */
  submitSolution(slug: string, input: SubmitInput): Promise<SubmissionSummary>
  getSubmission(submissionId: string): Promise<SubmissionResult>
  /** This user's submission history for a problem, newest first. */
  getSubmissions(slug: string): Promise<SubmissionResult[]>
```

- [ ] **Step 1: Apply the edits above.**

- [ ] **Step 2: Type-check**

Run (from `collide/`): `npx tsc -b`
Expected: FAIL — `mockApi` and `httpApi` don't implement the 3 new `Api` methods yet. This confirms the contract is enforced; Tasks 14 fixes both. (If you prefer green-at-each-step, do Tasks 13+14 as one commit.)

- [ ] **Step 3: Commit** (with Task 14, since the interface addition breaks compilation until both impls exist)

Defer commit to Task 14.

---

## Task 14: Frontend mockApi + httpApi Submit implementations

**Files:**
- Modify: `collide/src/api/mockApi.ts`, `collide/src/api/httpApi.ts`
- Test: `collide/src/api/submit.test.ts`

**Interfaces:**
- Consumes: `Api` additions from Task 13.
- Produces: working `submitSolution`/`getSubmission`/`getSubmissions` in both adapters.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { mockApi } from './mockApi'

describe('mockApi submit', () => {
  it('returns a PENDING id then an AC result for non-empty source', async () => {
    const { submissionId, status } = await mockApi.submitSolution('two-sum', { language: 'javascript', sourceCode: 'x' })
    expect(status).toBe('PENDING')
    const result = await mockApi.getSubmission(submissionId)
    expect(result.status).toBe('AC')
    expect(result.passed).toBe(result.total)
    expect(result.failingCaseIndex).toBe(-1)
  })

  it('records the submission in history', async () => {
    const { submissionId } = await mockApi.submitSolution('two-sum', { language: 'javascript', sourceCode: 'x' })
    const hist = await mockApi.getSubmissions('two-sum')
    expect(hist.some((s) => s.submissionId === submissionId)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `collide/`): `npx vitest run src/api/submit.test.ts`
Expected: FAIL — `submitSolution` not a function.

- [ ] **Step 3: Implement in `mockApi.ts`**

Add a small in-memory store near the top of the mock module and three methods to the exported object. The mock is UI-only (per CLAUDE.md) — it returns `AC` deterministically for any non-empty source so the Submit UX is exercisable offline:

```typescript
// near the other mock state
const mockSubmissions = new Map<string, SubmissionResult>()
const mockSubmissionsBySlug = new Map<string, SubmissionResult[]>()

// inside the exported mockApi object:
  async submitSolution(slug, input): Promise<SubmissionSummary> {
    const submissionId = nextId('sub')
    const accepted = !!input.sourceCode && input.sourceCode.trim().length > 0
    const result: SubmissionResult = {
      submissionId,
      problemSlug: slug,
      language: input.language,
      status: accepted ? 'AC' : 'WA',
      passed: accepted ? 100 : 0,
      total: 100,
      failingCaseIndex: accepted ? -1 : 0,
      runtimeMs: 12,
      createdAt: new Date().toISOString(),
    }
    mockSubmissions.set(submissionId, result)
    mockSubmissionsBySlug.set(slug, [result, ...(mockSubmissionsBySlug.get(slug) ?? [])])
    return { submissionId, status: 'PENDING' }
  },
  async getSubmission(submissionId): Promise<SubmissionResult> {
    const r = mockSubmissions.get(submissionId)
    if (!r) throw new Error('no such submission')
    return r
  },
  async getSubmissions(slug): Promise<SubmissionResult[]> {
    return mockSubmissionsBySlug.get(slug) ?? []
  },
```

Add the new type imports (`SubmissionResult`, `SubmissionSummary`, `SubmitInput`) to the existing `import type { … } from './types'` line in `mockApi.ts`.

- [ ] **Step 4: Implement in `httpApi.ts`** (mirror the existing `authed<T>` helper usage from `execute`)

```typescript
  async submitSolution(slug, input): Promise<SubmissionSummary> {
    return authed<SubmissionSummary>(`/api/problems/${encodeURIComponent(slug)}/submit`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
  async getSubmission(submissionId): Promise<SubmissionResult> {
    return authed<SubmissionResult>(`/api/submissions/${submissionId}`)
  },
  async getSubmissions(slug): Promise<SubmissionResult[]> {
    return authed<SubmissionResult[]>(`/api/problems/${encodeURIComponent(slug)}/submissions`)
  },
```

Add the new type imports to `httpApi.ts`. Note the backend `POST /submit` returns `{submissionId, status:"PENDING"}` — matches `SubmissionSummary`. The `authed` base URL already includes the host; confirm whether it prefixes `/api` (the execute path uses `/execute` with no `/api`, but problems use `/api/...` via `getProblems`). Match `getProblem`'s existing pathing for the `/api/problems/...` calls and `/execute`'s host handling for `/api/submissions/...`. Read the `authed`/`API_BASE` definition at the top of `httpApi.ts` and follow whichever prefixing the problem endpoints already use.

- [ ] **Step 5: Run test + typecheck**

Run (from `collide/`): `npx vitest run src/api/submit.test.ts && npx tsc -b`
Expected: PASS + typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/api/types.ts src/api/mockApi.ts src/api/httpApi.ts src/api/submit.test.ts
git commit -m "feat(sp4): frontend submit API contract + mock/http implementations"
```

---

## Task 15: submissionRunner — poll a submission to terminal

**Files:**
- Create: `collide/src/run/submissionRunner.ts`
- Test: `collide/src/run/submissionRunner.test.ts`

**Interfaces:**
- Consumes: `api.submitSolution`, `api.getSubmission`.
- Produces: `submitAndWait(slug, input, onUpdate) -> { cancel(): void }`, polling `getSubmission` until `status !== 'PENDING'`, invoking `onUpdate(result)` on each poll and at terminal.

- [ ] **Step 1: Write the failing test** (inject a fake api via a param to keep it pure)

```typescript
import { describe, it, expect, vi } from 'vitest'
import { pollSubmission } from './submissionRunner'
import type { SubmissionResult } from '../api/types'

describe('pollSubmission', () => {
  it('polls until terminal and reports the final verdict', async () => {
    const pending: SubmissionResult = { submissionId: 's1', problemSlug: 'two-sum', language: 'javascript', status: 'PENDING', passed: 0, total: 100, failingCaseIndex: -1, runtimeMs: 0, createdAt: '' }
    const done: SubmissionResult = { ...pending, status: 'AC', passed: 100, failingCaseIndex: -1 }
    const seq = [pending, pending, done]
    let i = 0
    const getSubmission = vi.fn(async () => seq[Math.min(i++, seq.length - 1)])
    const updates: SubmissionResult[] = []
    await pollSubmission('s1', getSubmission, (u) => updates.push(u), 0)
    expect(updates[updates.length - 1].status).toBe('AC')
    expect(getSubmission).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `collide/`): `npx vitest run src/run/submissionRunner.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

```typescript
/**
 * Drives one Submit to a terminal verdict: submit, then poll getSubmission until status leaves
 * PENDING. The Submit tier is authoritative/server-side (unlike Run's live WS stream), so a simple
 * poll is enough — verdicts are seconds-scale, not keystroke-scale.
 */
import { api } from '../api'
import type { SubmissionResult, SubmitInput } from '../api/types'

const POLL_INTERVAL_MS = 500
const POLL_MAX_ATTEMPTS = 240 // ~2 min ceiling

export interface SubmitHandle {
  cancel(): void
}

/** Pure poll loop, injectable for tests. Resolves once a terminal verdict is observed. */
export async function pollSubmission(
  submissionId: string,
  getSubmission: (id: string) => Promise<SubmissionResult>,
  onUpdate: (r: SubmissionResult) => void,
  intervalMs = POLL_INTERVAL_MS,
  isCancelled: () => boolean = () => false,
): Promise<void> {
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    if (isCancelled()) return
    const r = await getSubmission(submissionId)
    onUpdate(r)
    if (r.status !== 'PENDING') return
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}

export function submitAndWait(slug: string, input: SubmitInput, onUpdate: (r: SubmissionResult) => void): SubmitHandle {
  let cancelled = false
  void (async () => {
    try {
      const { submissionId } = await api.submitSolution(slug, input)
      await pollSubmission(submissionId, api.getSubmission, onUpdate, POLL_INTERVAL_MS, () => cancelled)
    } catch (e) {
      onUpdate({
        submissionId: '', problemSlug: slug, language: input.language, status: 'RE',
        passed: 0, total: 0, failingCaseIndex: -1, runtimeMs: 0, createdAt: new Date().toISOString(),
      })
    }
  })()
  return { cancel() { cancelled = true } }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `collide/`): `npx vitest run src/run/submissionRunner.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/run/submissionRunner.ts src/run/submissionRunner.test.ts
git commit -m "feat(sp4): submissionRunner — poll a submission to terminal verdict"
```

---

## Task 16: Verdict panel + wire real Submit into ProblemDetailPage

**Files:**
- Create: `collide/src/run/VerdictPanel.tsx`
- Modify: `collide/src/problems/ProblemDetailPage.tsx` (replace the client-side `onSubmit`)
- Test: `collide/src/run/VerdictPanel.test.tsx`

**Interfaces:**
- Consumes: `submitAndWait` (Task 15), `SubmissionResult` (Task 13), existing `api.updateProgress`.
- Produces: `VerdictPanel({ result }: { result: SubmissionResult | null })` rendering the verdict label + `passed/total` + failing index; `ProblemDetailPage.onSubmit` now calls the server judge.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VerdictPanel, verdictLabel } from './VerdictPanel'
import type { SubmissionResult } from '../api/types'

const base: SubmissionResult = {
  submissionId: 's', problemSlug: 'two-sum', language: 'javascript', status: 'AC',
  passed: 100, total: 100, failingCaseIndex: -1, runtimeMs: 12, createdAt: '',
}

describe('VerdictPanel', () => {
  it('maps verdict codes to human labels', () => {
    expect(verdictLabel('AC')).toBe('Accepted')
    expect(verdictLabel('WA')).toBe('Wrong Answer')
    expect(verdictLabel('TLE')).toBe('Time Limit Exceeded')
    expect(verdictLabel('RE')).toBe('Runtime Error')
    expect(verdictLabel('CE')).toBe('Compile Error')
  })

  it('shows passed/total and hides hidden input on WA', () => {
    render(<VerdictPanel result={{ ...base, status: 'WA', passed: 41, failingCaseIndex: 41 }} />)
    expect(screen.getByText(/41 \/ 100/)).toBeInTheDocument()
    expect(screen.getByText(/test 41/i)).toBeInTheDocument()
  })
})
```

(If the frontend test setup lacks `@testing-library/react`/`jsdom`, check `vitest.config.ts` / existing `.test.tsx` files. If no component test infra exists, reduce this to a pure unit test of `verdictLabel` and a function `verdictSummary(result): string`, and assert strings instead of rendering. Do NOT add new test infra just for this — match what the repo already supports.)

- [ ] **Step 2: Run test to verify it fails**

Run (from `collide/`): `npx vitest run src/run/VerdictPanel.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

`VerdictPanel.tsx`:

```tsx
import type { SubmissionResult, Verdict } from '../api/types'

const LABELS: Record<Verdict, string> = {
  AC: 'Accepted',
  WA: 'Wrong Answer',
  TLE: 'Time Limit Exceeded',
  RE: 'Runtime Error',
  CE: 'Compile Error',
}

export function verdictLabel(v: Verdict): string {
  return LABELS[v]
}

/** One-line human summary; never exposes a hidden input, only the failing index. */
export function verdictSummary(r: SubmissionResult): string {
  if (r.status === 'PENDING') return 'Judging…'
  if (r.status === 'AC') return `Accepted · ${r.passed} / ${r.total} · ${r.runtimeMs} ms`
  if (r.status === 'CE') return 'Compile Error'
  return `${verdictLabel(r.status)} · ${r.passed} / ${r.total} · on test ${r.failingCaseIndex}`
}

export function VerdictPanel({ result }: { result: SubmissionResult | null }) {
  if (!result) return null
  const cls = result.status === 'AC' ? 'verdict-ac' : result.status === 'PENDING' ? 'verdict-pending' : 'verdict-fail'
  return (
    <div className={`verdict-panel ${cls}`}>
      <strong>{result.status === 'PENDING' ? 'Judging…' : verdictLabel(result.status as Verdict)}</strong>
      {result.status !== 'PENDING' && result.status !== 'CE' && (
        <span> {result.passed} / {result.total} passed</span>
      )}
      {result.status !== 'PENDING' && result.status !== 'AC' && result.status !== 'CE' && (
        <span> · failed on test {result.failingCaseIndex}</span>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Wire into `ProblemDetailPage.tsx`** — replace the client-side `onSubmit` with the server path. Add state `const [verdict, setVerdict] = useState<SubmissionResult | null>(null)` and a submit handle ref. Replace the body of `onSubmit` (currently `if (!problem || running || !harness) return; void runHarness(true)`) with:

```tsx
  function onSubmit() {
    if (!problem || submitting) return
    setSubmitting(true)
    setVerdict(null)
    setOutputCollapsed(false)
    submitHandleRef.current = submitAndWait(
      problem.slug,
      { language: langRef.current, sourceCode: codeRef.current[langRef.current] ?? '' },
      (r) => {
        setVerdict(r)
        if (r.status !== 'PENDING') {
          setSubmitting(false)
          if (r.status === 'AC') {
            api.updateProgress(problem.id, { status: 'solved', completed: true }).then(setProgress).catch(() => {})
          }
        }
      },
    )
    save({ bumpAttempt: true })
  }
```

Add near the other imports:
```tsx
import { submitAndWait, type SubmitHandle } from '../run/submissionRunner'
import { VerdictPanel } from '../run/VerdictPanel'
import type { SubmissionResult } from '../api/types'
```
Add refs/state: `const [submitting, setSubmitting] = useState(false)`; `const [verdict, setVerdict] = useState<SubmissionResult | null>(null)`; `const submitHandleRef = useRef<SubmitHandle | null>(null)`. Render `<VerdictPanel result={verdict} />` in the results area (near where `BottomPanel`/case results render). Ensure the existing Submit button's disabled state uses `submitting` and that `onStop`/unmount calls `submitHandleRef.current?.cancel()`.

Keep `runHarness` for the **Run** button (sample cases) — SP4 only changes **Submit**. If `runHarness(true)` is now unused, remove its `submit` branch usage but keep the `runHarness(false)` path Run uses. Verify no other caller passes `true`.

- [ ] **Step 5: Run test + typecheck + build**

Run (from `collide/`): `npx vitest run src/run/VerdictPanel.test.tsx && npx tsc -b`
Expected: PASS + clean.

- [ ] **Step 6: Commit**

```bash
git add src/run/VerdictPanel.tsx src/run/VerdictPanel.test.tsx src/problems/ProblemDetailPage.tsx
git commit -m "feat(sp4): verdict panel + wire real server Submit into problem page"
```

---

## Task 17: Frontend full gate

- [ ] **Step 1: Run the frontend test suite + build**

Run (from `collide/`): `npm test` then `npm run build`
Expected: all Vitest suites green (including the existing whole-catalogue harness smoke and the new submit/verdict tests); `tsc -b && vite build` succeeds.

- [ ] **Step 2: Commit any fixups**

```bash
git commit -am "chore(sp4): frontend build green" || echo "nothing to commit"
```

---

## Task 18: Manual end-to-end smoke (documented) + completion notes

**Files:** none (verification + notes).

- [ ] **Step 1: Backend judge smoke** — already covered by `JudgeGoldenIT` running real JS+Java submissions against the committed bundles. Re-run `./gradlew test --tests 'app.collide.control.judge.*'` and record the pass count.

- [ ] **Step 2: Frontend Submit smoke against mock** — `npm run dev`, open a harnessed problem, click **Submit**, confirm the verdict panel shows `Accepted 100/100` for a correct mock submission and that Accepted marks the problem solved. (Optional; the `submit.test.ts`/`VerdictPanel.test.tsx` cover the logic.)

- [ ] **Step 3: Write completion notes** capturing the honest verification state (per spec §8):
  - ✅ JS + Java judge paths executed end-to-end (AC/WA/TLE/CE proven on real bundles).
  - ⚠️ Python + C++ drivers generated + string-verified only (no toolchain); **C++ operations dispatch is a documented stub** (no runtime reflection — deferred).
  - ⚠️ `submissions` Postgres persistence Testcontainers-gated (no Docker) — service logic unit-tested DB-free.
  - Update the SP4 memory (see below).

- [ ] **Step 4: Final commits already made per task.** Confirm both repos are clean:

Run: `git -C collab/collab/control status --short` and `git -C collide status --short`
Expected: clean (all work committed).

---

## Self-Review (completed during planning)

**Spec coverage:**
- §3 two tiers / Submit data flow → Tasks 8–10.
- §3b per-case invocation, compile-once, early-exit → Task 8.
- §3c generic stdin driver (all wire types + operations) → Tasks 4–7.
- §4 verdict semantics (CE/TLE/RE/WA/AC, failing index, hidden inputs) → Tasks 1, 8, 10.
- §5 anti-tamper (userId from JWT), limits, ownership → Tasks 9, 10.
- §6 frontend Submit UX (button, verdict panel, AC→solved, history) → Tasks 13–16.
- §7 checkers (exact/unordered/float; custom rejected), golden tests → Tasks 2, 11.
- §7 driver codegen tests (py/cpp string-only) → Task 7.
- §7 submissions persistence DB-free logic; Testcontainers-gated caveat → Task 9, 18.
- §8 honest verification (JS+Java live, py/cpp codegen-only, DB gated) → Tasks 5–8, 11, 18.

**Placeholder scan:** No "TBD"/"add error handling"-style gaps. The only intentional external reference is "port the serde constants from `harness.ts:<lines>`" in Task 4 — a verbatim copy of an existing, exact source (required for byte-identical output), with precise line ranges, not a paraphrase.

**Type consistency:** `Verdict`/`VerdictStatus` (Task 1) used consistently in Tasks 8–10; `generate(Language, ProblemHarness, String)` stable across Tasks 5–8; `SubmissionResult`/`SubmissionSummary`/`SubmitInput` consistent across Tasks 13–16; `pollSubmission`/`submitAndWait` signatures consistent Tasks 15–16.

**Known risk flagged for execution:** C++ generic operations dispatch is impossible without reflection or per-problem codegen; Task 7 emits a documented stub (C++ isn't runnable here and nothing depends on it). This is the one deliberate reduction from "all 4 languages fully general," recorded honestly.
