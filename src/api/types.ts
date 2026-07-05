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
  createRoom(name: string): Promise<Room>
  getRoom(roomId: string): Promise<Room>

  // --- members & roles (owner-managed) ---
  listMembers(roomId: string): Promise<Member[]>
  changeRole(roomId: string, userId: string, role: Role): Promise<void>
  revokeMember(roomId: string, userId: string): Promise<void>

  // --- share links ---
  createShareLink(roomId: string, role: Role): Promise<ShareLink>
}
