import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { IndexeddbPersistence } from 'y-indexeddb'

/**
 * One Y.Doc per room, shared by the code editor and the whiteboard. The doc holds
 * every file's text (getText("file:<path>")) and the tldraw notes map.
 *
 * Transport: the `collab` sync server (Node/Yjs) over WebSocket. The server is
 * document-agnostic — it syncs whatever structures live in this doc. We connect one
 * socket per room (docId = roomId).
 *
 * Offline: IndexeddbPersistence caches the doc locally, so edits continue with the
 * server down and merge automatically on reconnect (no lost work).
 *
 * AUTH: the dev server allows anonymous connections (DEV_ALLOW_ANON). When the Java
 * control plane exists, append `?token=<jwt>` to the params below.
 */

// e.g. VITE_COLLAB_URL=ws://localhost:4000/doc  (base; roomId is appended by the provider)
const COLLAB_URL = (import.meta.env.VITE_COLLAB_URL as string) || 'ws://localhost:4000/doc'

export interface RoomDoc {
  doc: Y.Doc
  provider: WebsocketProvider
  persistence: IndexeddbPersistence
}

const cache = new Map<string, RoomDoc>()

/** Access role from the invite link (?role=viewer|editor). Absent = full-access host. */
function roleFromUrl(): string {
  try {
    return new URLSearchParams(window.location.search).get('role') || 'editor'
  } catch {
    return 'editor'
  }
}

export function getRoomDoc(roomId: string): RoomDoc {
  let entry = cache.get(roomId)
  if (!entry) {
    const doc = new Y.Doc()
    // Local-first cache for offline + instant reload.
    const persistence = new IndexeddbPersistence(`collide-${roomId}`, doc)
    // WebsocketProvider connects to `${COLLAB_URL}/${roomId}` and auto-reconnects
    // with backoff; it queues local changes while offline and resyncs on reconnect.
    // `role` lets the server enforce viewer read-only (drops a viewer's edits); the
    // server clamps it so it can only downgrade access, never elevate.
    const provider = new WebsocketProvider(COLLAB_URL, roomId, doc, {
      connect: true,
      params: { role: roleFromUrl() },
      // params.token: add the JWT once the control plane issues them.
    })
    entry = { doc, provider, persistence }
    cache.set(roomId, entry)
  }
  return entry
}

/** Set the local user's presence info so collaborators see name + color. */
export function setPresence(roomId: string, user: { name: string; color: string }) {
  const { provider } = getRoomDoc(roomId)
  provider.awareness.setLocalStateField('user', user)
}

/** Live connection status for a room ("connected" | "connecting" | "disconnected"). */
export function onConnectionStatus(roomId: string, cb: (status: string) => void): () => void {
  const { provider } = getRoomDoc(roomId)
  const handler = (e: { status: string }) => cb(e.status)
  provider.on('status', handler)
  cb(provider.wsconnected ? 'connected' : 'connecting')
  return () => provider.off('status', handler)
}
