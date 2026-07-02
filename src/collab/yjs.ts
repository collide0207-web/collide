import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'

/**
 * One Y.Doc per room, shared by the code editor and (later) the whiteboard.
 *
 * For the frontend-first phase we use the y-webrtc provider. Across two tabs on
 * the same origin it also syncs via BroadcastChannel, so live co-editing works
 * with NO backend running.
 *
 * LATER: swap WebrtcProvider for the Hocuspocus/y-websocket provider pointing at
 * the real sync server. The rest of the app (MonacoBinding, awareness) is unchanged.
 */
export interface RoomDoc {
  doc: Y.Doc
  provider: WebrtcProvider
}

const cache = new Map<string, RoomDoc>()

export function getRoomDoc(roomId: string): RoomDoc {
  let entry = cache.get(roomId)
  if (!entry) {
    const doc = new Y.Doc()
    const provider = new WebrtcProvider(`collab-ide-room-${roomId}`, doc)
    entry = { doc, provider }
    cache.set(roomId, entry)
  }
  return entry
}

/** Set the local user's presence info so collaborators see name + color. */
export function setPresence(roomId: string, user: { name: string; color: string }) {
  const { provider } = getRoomDoc(roomId)
  provider.awareness.setLocalStateField('user', user)
}
