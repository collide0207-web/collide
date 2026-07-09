import type {
  Api,
  AuthResult,
  ExecutionResult,
  ExecutionSubmission,
  InterviewQuestion,
  Member,
  ProblemDetail, ProblemSummary, ProgressUpdate, Role,
  Room,
  RoomMode,
  ShareLink,
  SignupInput,
  User, UserProgress,
} from './types'
import { useSession } from '../store/session'

/**
 * Real backend client for the Spring Boot control plane. Selected over `mockApi` when
 * VITE_API_URL is set (see ./index.ts).
 *
 * Responsibilities:
 *  - Unwrap the { success, message, data } envelope; turn { success:false, ... } into an
 *    ApiError with the server's status + message.
 *  - Attach the Bearer access token to authenticated calls.
 *  - On a 401, transparently refresh (rotating the refresh token) and retry once. The
 *    refresh is single-flight so concurrent 401s trigger exactly one refresh.
 */

const BASE = (import.meta.env.VITE_API_URL as string) || 'http://localhost:8080'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

interface Envelope<T> {
  success?: boolean
  message?: string
  data?: T
  error?: string
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text()
  let body: Envelope<T> | T | undefined
  try {
    body = text ? (JSON.parse(text) as Envelope<T>) : undefined
  } catch {
    body = undefined
  }
  if (!res.ok) {
    const env = body as Envelope<T> | undefined
    throw new ApiError(res.status, env?.message || env?.error || res.statusText)
  }
  // Auth endpoints wrap payload in `data`; room endpoints return it directly.
  const env = body as Envelope<T>
  return (env && typeof env === 'object' && 'data' in env ? env.data : (body as T)) as T
}

function jsonInit(init?: RequestInit, token?: string | null): RequestInit {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (init?.headers) Object.assign(headers, init.headers)
  if (token) headers['Authorization'] = `Bearer ${token}`
  return { ...init, headers }
}

/** Unauthenticated request (login/signup/google/refresh/logout). */
async function pub<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, jsonInit(init))
  return parse<T>(res)
}

let refreshInFlight: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight
  refreshInFlight = (async () => {
    const rt = useSession.getState().refreshToken
    if (!rt) return null
    try {
      const data = await pub<RawAuth>('/api/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: rt }),
      })
      useSession.getState().setTokens({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresIn: data.expiresIn,
      })
      return data.accessToken
    } catch {
      useSession.getState().logout() // refresh failed / reused → force re-login
      return null
    }
  })()
  try {
    return await refreshInFlight
  } finally {
    refreshInFlight = null
  }
}

/** Authenticated request with one transparent refresh-and-retry on 401. */
async function authed<T>(path: string, init?: RequestInit): Promise<T> {
  const token = useSession.getState().accessToken
  let res = await fetch(BASE + path, jsonInit(init, token))
  if (res.status === 401) {
    const fresh = await refreshAccessToken()
    if (fresh) res = await fetch(BASE + path, jsonInit(init, fresh))
  }
  return parse<T>(res)
}

// --- backend DTO shapes (as returned in `data`) -----------------------------

interface RawUser {
  id: string
  email: string
  username: string
  name: string
  role: string
  emailVerified: boolean
  profilePicture?: string | null
  authProvider: string
  createdAt: string
}
interface RawAuth {
  accessToken: string
  refreshToken: string
  tokenType: string
  expiresIn: number
  user: RawUser
}
interface RawRoom {
  id: string
  name: string
  mode: string
  ownerId: string
  myRole: string
}
interface RawMember {
  userId: string
  role: Role
}
interface RawLink {
  id: string
  token: string
  role: Role
  roomId: string
}

function mapUser(u: RawUser): User {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    username: u.username,
    role: u.role as User['role'],
    emailVerified: u.emailVerified,
    avatarUrl: u.profilePicture ?? undefined,
  }
}

function mapAuth(a: RawAuth): AuthResult {
  return {
    user: mapUser(a.user),
    accessToken: a.accessToken,
    refreshToken: a.refreshToken,
    expiresIn: a.expiresIn,
  }
}

export const httpApi: Api = {
  // --- auth ---
  async signup(input: SignupInput) {
    return mapAuth(await pub<RawAuth>('/api/auth/signup', { method: 'POST', body: JSON.stringify(input) }))
  },

  async login(email, password) {
    return mapAuth(await pub<RawAuth>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }))
  },

  async loginWithGoogle(idToken) {
    return mapAuth(await pub<RawAuth>('/api/auth/google', { method: 'POST', body: JSON.stringify({ idToken }) }))
  },

  async refresh(refreshToken) {
    return mapAuth(await pub<RawAuth>('/api/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }) }))
  },

  async logout(refreshToken) {
    await pub<void>('/api/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) })
  },

  async me() {
    return mapUser(await authed<RawUser>('/api/auth/me'))
  },

  // --- rooms ---
  async createRoom(name, mode: RoomMode = 'group') {
    const r = await authed<RawRoom>('/rooms', { method: 'POST', body: JSON.stringify({ name, mode }) })
    return { id: r.id, name: r.name, ownerId: r.ownerId }
  },

  async getRoom(roomId) {
    const r = await authed<RawRoom>(`/rooms/${roomId}`)
    return { id: r.id, name: r.name, ownerId: r.ownerId }
  },

  async listMembers(roomId) {
    const members = await authed<RawMember[]>(`/rooms/${roomId}/members`)
    return members.map<Member>((m) => ({
      user: { id: m.userId, name: m.userId, email: '' },
      role: m.role,
    }))
  },

  async changeRole(roomId, userId, role) {
    await authed<void>(`/rooms/${roomId}/members/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    })
  },

  async revokeMember(roomId, userId) {
    await authed<void>(`/rooms/${roomId}/members/${userId}`, { method: 'DELETE' })
  },

  async createShareLink(roomId, role): Promise<ShareLink> {
    const link = await authed<RawLink>(`/rooms/${roomId}/links`, {
      method: 'POST',
      body: JSON.stringify({ role }),
    })
    return {
      token: link.token,
      role: link.role,
      url: `${location.origin}/room/${roomId}?mode=group&role=${role}&t=${link.token}`,
    }
  },

  // --- interview questions ---
  async saveInterview(roomId, questions) {
    await authed<InterviewQuestion[]>(`/rooms/${roomId}/interview`, {
      method: 'PUT',
      body: JSON.stringify(questions),
    })
  },

  async getInterview(roomId) {
    return authed<InterviewQuestion[]>(`/rooms/${roomId}/interview`)
  },

  async uploadInterviewImage(roomId, file) {
    // Multipart: must NOT set Content-Type (the browser adds the boundary), so this
    // bypasses jsonInit and does its own token + refresh-retry, mirroring authed().
    const form = new FormData()
    form.append('file', file)
    const send = (t: string | null) =>
      fetch(`${BASE}/rooms/${roomId}/interview/images`, {
        method: 'POST',
        headers: t ? { Authorization: `Bearer ${t}` } : {},
        body: form,
      })
    let res = await send(useSession.getState().accessToken)
    if (res.status === 401) {
      const fresh = await refreshAccessToken()
      if (fresh) res = await send(fresh)
    }
    const { id } = await parse<{ id: string }>(res)
    return { id, url: `${BASE}/rooms/${roomId}/interview/images/${id}` }
  },

  // --- code execution ---
  async execute(language, sourceCode, stdin) {
    return authed<ExecutionSubmission>('/execute', {
      method: 'POST',
      body: JSON.stringify({ language, sourceCode, stdin }),
    })
  },

  async getExecutionStatus(executionId) {
    return authed<ExecutionSubmission>(`/status/${executionId}`)
  },

  async getExecutionResult(executionId) {
    return authed<ExecutionResult>(`/result/${executionId}`)
  },

  async cancelExecution(executionId) {
    await authed<void>(`/cancel/${executionId}`, { method: 'POST' })
  },

  // --- problems & progress ---
  async getProblems(sheet = 'neetcode150') {
    return authed<ProblemSummary[]>(`/api/problems?sheet=${encodeURIComponent(sheet)}`)
  },

  async getProblem(slug) {
    return authed<ProblemDetail>(`/api/problems/${encodeURIComponent(slug)}`)
  },

  async getProblemCategories(sheet = 'neetcode150') {
    return authed<string[]>(`/api/problems/categories?sheet=${encodeURIComponent(sheet)}`)
  },

  async getAllProgress() {
    return authed<UserProgress[]>('/api/progress')
  },

  async getProblemProgress(problemId) {
    return authed<UserProgress>(`/api/progress/${problemId}`)
  },

  async updateProgress(problemId, patch: ProgressUpdate) {
    return authed<UserProgress>(`/api/progress/${problemId}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    })
  },

  async setFavorite(problemId, favorite) {
    return authed<UserProgress>(`/api/progress/${problemId}/favorite`, {
      method: favorite ? 'POST' : 'DELETE',
    })
  },
}
