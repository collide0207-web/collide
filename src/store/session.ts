import { create } from 'zustand'
import type { User } from '../api/types'

export type StudyMode = 'solo' | 'group'

interface SessionState {
  user: User | null
  token: string | null
  mode: StudyMode
  setSession: (user: User, token: string) => void
  setMode: (mode: StudyMode) => void
  logout: () => void
}

export const useSession = create<SessionState>((set) => ({
  user: null,
  token: null,
  mode: 'solo',
  setSession: (user, token) => set({ user, token }),
  setMode: (mode) => set({ mode }),
  logout: () => set({ user: null, token: null }),
}))
