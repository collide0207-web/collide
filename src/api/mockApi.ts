import type { Api, Member, Role, Room, ShareLink, User } from './types'

/**
 * In-memory + localStorage mock of the backend. Stands in until the Spring Boot
 * control plane exists. NOTHING here is a security boundary — roles are advisory
 * UI state only. Real auth/enforcement lands with the backend.
 */

const LS_KEY = 'collab-ide-mock'

interface Store {
  rooms: Record<string, Room>
  members: Record<string, Member[]>
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

export const mockApi: Api = {
  async login(email, name) {
    const user: User = { id: nextId('u'), name, email }
    return { user, token: `mock-jwt-${user.id}` }
  },

  async createRoom(name) {
    const s = load()
    const ownerId = 'me'
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
      // allow opening an unknown room id (e.g. via a shared link) as a fresh room
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
      // mode=group so the invitee lands in the shared session (with the call),
      // not the solo view.
      url: `${location.origin}/room/${roomId}?mode=group&role=${role}&t=${token}`,
    }
  },
}
