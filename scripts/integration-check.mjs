// Proves the frontend's real transport (y-websocket) syncs two clients THROUGH the
// running collab server — client A types, client B receives it via the server.
// Run with collab server + docker up:  node scripts/integration-check.mjs
import { WebsocketProvider } from 'y-websocket'
import * as Y from 'yjs'
import WebSocket from 'ws'

const URL = 'ws://localhost:4000/doc'
const ROOM = 'integration-room-' + Date.now()
const KEY = 'file:src/index.js'
const MSG = 'typed-on-A → seen-on-B ✓'

const docA = new Y.Doc()
const docB = new Y.Doc()
const a = new WebsocketProvider(URL, ROOM, docA, { WebSocketPolyfill: WebSocket })
const b = new WebsocketProvider(URL, ROOM, docB, { WebSocketPolyfill: WebSocket })

function waitConnected(p) {
  return new Promise((res) => {
    if (p.wsconnected) return res()
    p.on('status', (e) => e.status === 'connected' && res())
  })
}

const fail = (m) => {
  console.error('FAIL:', m)
  process.exit(1)
}

const timeout = setTimeout(() => fail('timed out waiting for cross-client sync'), 8000)

await Promise.all([waitConnected(a), waitConnected(b)])

// Client A types into a file.
docA.getText(KEY).insert(0, MSG)

// Poll client B until it receives the text through the server.
const start = Date.now()
const iv = setInterval(() => {
  const got = docB.getText(KEY).toString()
  if (got === MSG) {
    clearInterval(iv)
    clearTimeout(timeout)
    console.log(`PASS: client B received "${got}" via the collab server in ${Date.now() - start}ms`)
    a.destroy()
    b.destroy()
    process.exit(0)
  }
}, 100)
