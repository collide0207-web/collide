/**
 * API CONTRACT
 * ------------
 * These types ARE the spec the Spring Boot backend will implement. Building the
 * frontend against this interface (with a mock now) means the real backend is a
 * drop-in swap later: replace mockApi with an httpApi that hits REST endpoints.
 */

export type Role = 'owner' | 'editor' | 'viewer'

export interface User {
  id: string
  name: string
  email: string
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

export interface Api {
  // auth
  login(email: string, name: string): Promise<{ user: User; token: string }>

  // rooms
  createRoom(name: string): Promise<Room>
  getRoom(roomId: string): Promise<Room>

  // members & roles (owner-managed)
  listMembers(roomId: string): Promise<Member[]>
  changeRole(roomId: string, userId: string, role: Role): Promise<void>
  revokeMember(roomId: string, userId: string): Promise<void>

  // share links
  createShareLink(roomId: string, role: Role): Promise<ShareLink>
}
