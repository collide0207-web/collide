import * as Y from 'yjs'
import { Editor, getSnapshot, type TLRecord } from 'tldraw'

/**
 * Two-way sync between a tldraw store and a Yjs map, so the notes canvas is
 * collaborative just like the code editor. Document-scoped records (shapes, pages,
 * bindings…) live in a shared Y.Map keyed by record id.
 *
 * We tag our own Yjs writes with ORIGIN and skip them on the way back to avoid echo
 * loops, and use store.mergeRemoteChanges so applied changes aren't re-broadcast.
 *
 * LATER: this same map syncs over the real server provider (Hocuspocus) instead of
 * y-webrtc — no change needed here.
 */
export function bindTldrawToYjs(editor: Editor, doc: Y.Doc): () => void {
  const store = editor.store
  const yRecords = doc.getMap<TLRecord>('tldraw')
  const ORIGIN = 'tldraw-yjs'

  // ---- initial sync ----
  if (yRecords.size === 0) {
    // First one in: seed the shared map from the local store.
    const snapshot = getSnapshot(store)
    doc.transact(() => {
      for (const record of Object.values(snapshot.document.store)) {
        yRecords.set(record.id, record as TLRecord)
      }
    }, ORIGIN)
  } else {
    // Joining an existing board: load its records into the local store.
    const records: TLRecord[] = []
    yRecords.forEach((r) => records.push(r))
    store.mergeRemoteChanges(() => store.put(records))
  }

  // ---- local edits -> Yjs ----
  const unlisten = store.listen(
    (entry) => {
      doc.transact(() => {
        for (const rec of Object.values(entry.changes.added)) yRecords.set(rec.id, rec)
        for (const [, to] of Object.values(entry.changes.updated)) yRecords.set(to.id, to)
        for (const rec of Object.values(entry.changes.removed)) yRecords.delete(rec.id)
      }, ORIGIN)
    },
    { source: 'user', scope: 'document' },
  )

  // ---- Yjs -> local store ----
  const observer = (event: Y.YMapEvent<TLRecord>, txn: Y.Transaction) => {
    if (txn.origin === ORIGIN) return
    const puts: TLRecord[] = []
    const removes: TLRecord['id'][] = []
    event.changes.keys.forEach((change, key) => {
      if (change.action === 'delete') {
        removes.push(key as TLRecord['id'])
      } else {
        const v = yRecords.get(key)
        if (v) puts.push(v)
      }
    })
    store.mergeRemoteChanges(() => {
      if (puts.length) store.put(puts)
      if (removes.length) store.remove(removes)
    })
  }
  yRecords.observe(observer)

  return () => {
    unlisten()
    yRecords.unobserve(observer)
  }
}
