/**
 * API CONTRACT
 * ------------
 * These types ARE the spec the Spring Boot control plane implements. Building the
 * frontend against this interface means the real backend is a drop-in swap: `mockApi`
 * for local UI work, `httpApi` (fetch → Spring Boot) when VITE_API_URL is set.
 */

/** Per-room role (authoritative enforcement is server-side). */
export type Role = 'owner' | 'editor' | 'viewer'

/** Account-level role carried in the JWT `roles` claim. */
export type AccountRole = 'USER' | 'ADMIN' | 'MODERATOR' | 'OWNER'

export interface User {
  id: string
  name: string
  email: string
  username?: string
  role?: AccountRole
  emailVerified?: boolean
  avatarUrl?: string
}

export interface Member {
  user: User
  role: Role
}

export interface Room {
  id: string
  name: string
  ownerId: string
}

export type RoomMode = 'solo' | 'group' | 'interview'

/** One example case: candidate implements `fnName`, called with `args` → `expected`. */
export interface InterviewTestCase {
  args: string
  expected: string
}

export interface InterviewQuestion {
  id: string
  title: string
  description: string
  fnName: string
  tests: InterviewTestCase[]
  /** Reference image URLs (served by the control plane). */
  images: string[]
}

export interface ShareLink {
  token: string
  role: Role
  url: string
}

/** The token bundle returned by every auth entrypoint. */
export interface AuthResult {
  user: User
  accessToken: string
  refreshToken: string
  /** Access-token lifetime in seconds — the client refreshes shortly before this. */
  expiresIn: number
}

export interface SignupInput {
  email: string
  username: string
  name: string
  password: string
}

/** Lifecycle of one code execution — mirrors the control plane's ExecutionStatus enum. */
export type ExecutionStatus = 'PENDING' | 'COMPILING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'TIMEOUT' | 'CANCELLED'

export interface ExecutionSubmission {
  executionId: string
  status: ExecutionStatus
}

export interface ExecutionResult {
  executionId: string
  language: string
  status: ExecutionStatus
  stdout: string | null
  stderr: string | null
  exitCode: number | null
  executionTimeMs: number
  stdoutTruncated: boolean
  stderrTruncated: boolean
}

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

// --- coding-practice problems (NeetCode 150) ---

export type Difficulty = 'easy' | 'medium' | 'hard'
export type ProblemStatus = 'unsolved' | 'attempted' | 'solved'

export interface ProblemSummary {
  id: string
  slug: string
  title: string
  difficulty: Difficulty
  category: string
  tags: string[]
  order: number
  /** Whether we host an original statement (vs. metadata-only, link-out). */
  hasStatement: boolean
}

export interface ProblemExample {
  input: string
  output: string
  explanation?: string
}

/** One positional parameter of a harnessed problem's entry function. */
export interface HarnessParam {
  name: string
  /** Canonical type tag driving codegen: int, double, bool, string, int[], string[], int[][], … */
  type: string
}

/** One example case: `input` values in param order, `expected` return value. */
export interface HarnessTest {
  input: unknown[]
  expected: unknown
}

/**
 * LeetCode-style test-runner metadata. When present, Run wraps the user's `Solution`
 * in a generated driver (main + I/O), feeds each test's inputs, and checks the output
 * against `expected`. Absent → Run executes the submitted source as-is.
 */
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

export interface ProblemDetail {
  id: string
  slug: string
  title: string
  difficulty: Difficulty
  category: string
  tags: string[]
  description: string | null
  examples: ProblemExample[] | null
  constraints: string | null
  sourceUrl: string | null
  /** language → starter code. */
  starterCode: Record<string, string>
  supportedLanguages: string[]
  /** Test-runner metadata; null for metadata-only or not-yet-authored problems. */
  harness?: ProblemHarness | null
}

export interface UserProgress {
  problemId: string
  status: ProblemStatus
  language: string | null
  /** language → last saved source (per-language work preserved). */
  code: Record<string, string>
  favorite: boolean
  completed: boolean
  timeSpent: number
  attemptCount: number
  runCount: number
  lastOpened: string | null
  updatedAt: string | null
}

export interface ProgressUpdate {
  status?: ProblemStatus
  language?: string
  code?: Record<string, string>
  completed?: boolean
  bumpRun?: boolean
  bumpAttempt?: boolean
  timeSpentInc?: number
}

export interface Api {
  // --- auth ---
  signup(input: SignupInput): Promise<AuthResult>
  login(email: string, password: string): Promise<AuthResult>
  /** Continue with Google: exchange a Google ID token for our tokens. */
  loginWithGoogle(idToken: string): Promise<AuthResult>
  /** Rotate the refresh token and mint a new access token. */
  refresh(refreshToken: string): Promise<AuthResult>
  logout(refreshToken: string): Promise<void>
  me(): Promise<User>

  // --- rooms ---
  createRoom(name: string, mode?: RoomMode): Promise<Room>
  getRoom(roomId: string): Promise<Room>

  // --- members & roles (owner-managed) ---
  listMembers(roomId: string): Promise<Member[]>
  changeRole(roomId: string, userId: string, role: Role): Promise<void>
  revokeMember(roomId: string, userId: string): Promise<void>

  // --- share links ---
  createShareLink(roomId: string, role: Role): Promise<ShareLink>

  // --- interview questions ---
  /** Save/replace the room's question set (interviewer only). */
  saveInterview(roomId: string, questions: InterviewQuestion[]): Promise<void>
  /** Fetch the room's question set (empty if none). */
  getInterview(roomId: string): Promise<InterviewQuestion[]>
  /** Upload a reference image; returns its id and a loadable URL. */
  uploadInterviewImage(roomId: string, file: File): Promise<{ id: string; url: string }>

  // --- code execution ---
  /** Submit code for execution. Returns immediately with a PENDING id — poll
   * getExecutionStatus/getExecutionResult, or stream via runCode() in src/run/runner.ts. */
  execute(language: string, sourceCode: string, stdin?: string): Promise<ExecutionSubmission>
  getExecutionStatus(executionId: string): Promise<ExecutionSubmission>
  getExecutionResult(executionId: string): Promise<ExecutionResult>
  cancelExecution(executionId: string): Promise<void>

  // --- server-side judging (Submit) ---
  /** Submit a solution for authoritative hidden-case judging. Returns a PENDING id to poll. */
  submitSolution(slug: string, input: SubmitInput): Promise<SubmissionSummary>
  getSubmission(submissionId: string): Promise<SubmissionResult>
  /** This user's submission history for a problem, newest first. */
  getSubmissions(slug: string): Promise<SubmissionResult[]>

  // --- problems & progress (NeetCode 150) ---
  getProblems(sheet?: string): Promise<ProblemSummary[]>
  getProblem(slug: string): Promise<ProblemDetail>
  getProblemCategories(sheet?: string): Promise<string[]>
  /** All of the current user's progress rows (for the sheet + dashboard). */
  getAllProgress(): Promise<UserProgress[]>
  getProblemProgress(problemId: string): Promise<UserProgress>
  updateProgress(problemId: string, patch: ProgressUpdate): Promise<UserProgress>
  setFavorite(problemId: string, favorite: boolean): Promise<UserProgress>
}
