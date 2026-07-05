import { create } from 'zustand'
import type { User } from '../api/types'
import { setCollabToken } from '../collab/yjs'

export type StudyMode = 'solo' | 'group'

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  expiresIn?: number
}

const LS_KEY = 'collide-session'

interface Persisted {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
}

function loadPersisted(): Persisted {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw) as Persisted
  } catch {
    /* ignore corrupt storage */
  }
  return { user: null, accessToken: null, refreshToken: null }
}

function persist(p: Persisted) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(p))
  } catch {
    /* storage may be unavailable (private mode) — session still works in memory */
  }
}

interface SessionState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  mode: StudyMode
  /** Establish a session after login/signup/google. */
  setSession: (user: User, tokens: AuthTokens) => void
  /** Replace tokens after a refresh (user unchanged). */
  setTokens: (tokens: AuthTokens) => void
  setMode: (mode: StudyMode) => void
  logout: () => void
}

const initial = loadPersisted()
// Seed the collab WebSocket token so a reloaded session reconnects authenticated.
setCollabToken(initial.accessToken)

export const useSession = create<SessionState>((set, get) => ({
  user: initial.user,
  accessToken: initial.accessToken,
  refreshToken: initial.refreshToken,
  mode: 'solo',

  setSession: (user, tokens) => {
    setCollabToken(tokens.accessToken)
    persist({ user, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken })
    set({ user, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken })
  },

  setTokens: (tokens) => {
    setCollabToken(tokens.accessToken)
    persist({ user: get().user, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken })
    set({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken })
  },

  setMode: (mode) => set({ mode }),

  logout: () => {
    setCollabToken(null)
    persist({ user: null, accessToken: null, refreshToken: null })
    set({ user: null, accessToken: null, refreshToken: null })
  },
}))
