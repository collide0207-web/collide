import { create } from 'zustand'
import type { Role, User } from '../api/types'

interface SessionState {
  user: User | null
  token: string | null
  /** Role we are simulating in the current room (frontend-first testing aid). */
  simulatedRole: Role
  setSession: (user: User, token: string) => void
  setSimulatedRole: (role: Role) => void
}

export const useSession = create<SessionState>((set) => ({
  user: null,
  token: null,
  simulatedRole: 'owner',
  setSession: (user, token) => set({ user, token }),
  setSimulatedRole: (role) => set({ simulatedRole: role }),
}))
