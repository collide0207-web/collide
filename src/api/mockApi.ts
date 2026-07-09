import type { Api, AuthResult, InterviewQuestion, Member, ProblemSummary, ProgressUpdate, Role, Room, ShareLink, SignupInput, User, UserProgress } from './types'
import { MOCK_PROBLEMS } from '../problems/seed'

/**
 * In-memory + localStorage mock of the backend. Stands in for local UI work when
 * VITE_API_URL is not set. NOTHING here is a security boundary — tokens are fake and
 * roles are advisory UI state only. Real auth/enforcement lives in the Spring Boot
 * control plane (see httpApi.ts).
 */

const LS_KEY = 'collab-ide-mock'
const USER_KEY = 'collab-ide-mock-user'

interface Store {
  rooms: Record<string, Room>
  members: Record<string, Member[]>
  interview?: Record<string, InterviewQuestion[]>
  progress?: Record<string, UserProgress>
}

function emptyProgress(problemId: string): UserProgress {
  return {
    problemId, status: 'unsolved', language: null, code: {}, favorite: false,
    completed: false, timeSpent: 0, attemptCount: 0, runCount: 0, lastOpened: null, updatedAt: null,
  }
}

function load(): Store {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '') as Store
  } catch {
    return { rooms: {}, members: {} }
  }
}

function save(s: Store) {
  localStorage.setItem(LS_KEY, JSON.stringify(s))
}

let id = 0
const nextId = (p: string) => `${p}_${Date.now().toString(36)}_${id++}`

function rememberUser(user: User) {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  } catch {
    /* ignore */
  }
}

function currentUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as User) : null
  } catch {
    return null
  }
}

function fakeAuth(user: User): AuthResult {
  rememberUser(user)
  return {
    user,
    accessToken: `mock-access-${user.id}`,
    refreshToken: `mock-refresh-${user.id}`,
    expiresIn: 900,
  }
}

export const mockApi: Api = {
  // --- auth (fake) ---
  async signup(input: SignupInput) {
    const user: User = {
      id: nextId('u'),
      name: input.name,
      email: input.email,
      username: input.username,
      role: 'USER',
      emailVerified: false,
    }
    return fakeAuth(user)
  },

  async login(email, _password) {
    const user: User = { id: nextId('u'), name: email.split('@')[0], email, role: 'USER' }
    return fakeAuth(user)
  },

  async loginWithGoogle(_idToken) {
    const user: User = {
      id: nextId('u'),
      name: 'Google User',
      email: 'google.user@example.com',
      role: 'USER',
      emailVerified: true,
    }
    return fakeAuth(user)
  },

  async refresh(refreshToken) {
    const user = currentUser()
    if (!user) throw new Error('not authenticated')
    return { user, accessToken: refreshToken.replace('refresh', 'access'), refreshToken, expiresIn: 900 }
  },

  async logout(_refreshToken) {
    try {
      localStorage.removeItem(USER_KEY)
    } catch {
      /* ignore */
    }
  },

  async me() {
    const u = currentUser()
    if (!u) throw new Error('not authenticated')
    return u
  },

  // --- rooms ---
  async createRoom(name) {
    const s = load()
    const ownerId = 'me'
    // mode isn't persisted in the mock Room shape; the SPA carries it in the URL.
    const room: Room = { id: nextId('r'), name, ownerId }
    s.rooms[room.id] = room
    s.members[room.id] = [
      { user: { id: ownerId, name: 'You', email: 'you@example.com' }, role: 'owner' },
    ]
    save(s)
    return room
  },

  async getRoom(roomId) {
    const s = load()
    if (!s.rooms[roomId]) {
      s.rooms[roomId] = { id: roomId, name: 'Shared Room', ownerId: 'me' }
      s.members[roomId] = [
        { user: { id: 'me', name: 'You', email: 'you@example.com' }, role: 'owner' },
      ]
      save(s)
    }
    return s.rooms[roomId]
  },

  async listMembers(roomId) {
    return load().members[roomId] || []
  },

  async changeRole(roomId, userId, role: Role) {
    const s = load()
    const members = s.members[roomId] || []
    const m = members.find((x) => x.user.id === userId)
    if (m) m.role = role
    save(s)
  },

  async revokeMember(roomId, userId) {
    const s = load()
    s.members[roomId] = (s.members[roomId] || []).filter((x) => x.user.id !== userId)
    save(s)
  },

  async createShareLink(roomId, role): Promise<ShareLink> {
    const token = nextId('lnk')
    return {
      token,
      role,
      url: `${location.origin}/room/${roomId}?mode=group&role=${role}&t=${token}`,
    }
  },

  // --- interview questions ---
  async saveInterview(roomId, questions) {
    const s = load()
    s.interview = s.interview || {}
    s.interview[roomId] = questions
    save(s)
  },

  async getInterview(roomId) {
    return load().interview?.[roomId] || []
  },

  async uploadInterviewImage(_roomId, file) {
    // No server to store bytes — inline the image as a data URL so <img> still works.
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
    return { id: nextId('img'), url }
  },

  // --- problems & progress (served from the embedded mirror) ---
  async getProblems() {
    return MOCK_PROBLEMS.map<ProblemSummary>((p, i) => ({
      id: p.id, slug: p.slug, title: p.title, difficulty: p.difficulty,
      category: p.category, tags: p.tags, order: i,
      hasStatement: !!p.description,
    }))
  },

  async getProblem(slug) {
    const p = MOCK_PROBLEMS.find((x) => x.slug === slug)
    if (!p) throw new Error('problem not found')
    return p
  },

  async getProblemCategories() {
    return [...new Set(MOCK_PROBLEMS.map((p) => p.category))]
  },

  async getAllProgress() {
    return Object.values(load().progress || {})
  },

  async getProblemProgress(problemId) {
    return load().progress?.[problemId] || emptyProgress(problemId)
  },

  async updateProgress(problemId, patch: ProgressUpdate) {
    const s = load()
    s.progress = s.progress || {}
    const cur = s.progress[problemId] || emptyProgress(problemId)
    const next: UserProgress = {
      ...cur,
      status: patch.completed ? 'solved' : patch.status ?? cur.status,
      language: patch.language ?? cur.language,
      code: patch.code ?? cur.code,
      completed: patch.completed ?? cur.completed,
      runCount: cur.runCount + (patch.bumpRun ? 1 : 0),
      attemptCount: cur.attemptCount + (patch.bumpAttempt ? 1 : 0),
      timeSpent: cur.timeSpent + (patch.timeSpentInc || 0),
      lastOpened: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    if (patch.bumpRun && next.status === 'unsolved') next.status = 'attempted'
    s.progress[problemId] = next
    save(s)
    return next
  },

  async setFavorite(problemId, favorite) {
    const s = load()
    s.progress = s.progress || {}
    const cur = s.progress[problemId] || emptyProgress(problemId)
    const next = { ...cur, favorite, updatedAt: new Date().toISOString() }
    s.progress[problemId] = next
    save(s)
    return next
  },
}
