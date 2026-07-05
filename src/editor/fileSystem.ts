/**
 * Yjs-backed virtual file system for a room.
 * --------------------------------------------------------------------------
 * The explorer is NOT hardcoded and NOT a static tree: every folder/file lives
 * in the shared Y.Doc, so the collab server (document-agnostic) syncs + persists
 * it for free. That gives us the whole feature list at once:
 *   - real-time sync   → every collaborator sees create/rename/move/delete live
 *   - offline          → IndexedDB cache, conflict-free merge on reconnect
 *   - persistence      → the server snapshots the doc (it IS the source of truth)
 *
 * Data model (id-based so content never has to move):
 *   - A Y.Map<FsNode> keyed by node id holds the structure: { id, name, parentId, type }.
 *   - File CONTENT lives at doc.getText('file:' + id). Because we key by a stable
 *     id (not path), rename/move only mutate the node record — the Y.Text is
 *     untouched, so no content ever has to be copied between keys.
 *   - The visible path is derived by walking parentId → root.
 *
 * Concurrency: Y.Map is a CRDT (per-key LWW on structure). Two people creating
 * files converge; deleting a folder someone is editing converges to "deleted".
 * The seed uses FIXED ids so two peers seeding at once converge to ONE tree
 * instead of duplicating it.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import * as Y from 'yjs'
import { getRoomDoc } from '../collab/yjs'

export type NodeType = 'file' | 'folder'

/** A raw node as stored in the Y.Map. */
export interface FsNode {
  id: string
  name: string
  /** null → top level. */
  parentId: string | null
  type: NodeType
}

/** A node enriched for rendering (derived, never stored). */
export interface TreeNode extends FsNode {
  path: string
  depth: number
  children: TreeNode[]
}

export const FS_MAP = 'fs'
const textKey = (id: string) => `file:${id}`

function uid(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return 'n_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
  }
}

// ---------------------------------------------------------------------------
// Pure helpers over a snapshot of nodes
// ---------------------------------------------------------------------------

/** Folders first, then case/numeric-insensitive by name — VS Code ordering. */
function compareNodes(a: FsNode, b: FsNode): number {
  if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
}

/** Build the render tree from a flat list of nodes. */
export function buildTree(nodes: FsNode[]): TreeNode[] {
  const byParent = new Map<string | null, FsNode[]>()
  for (const n of nodes) {
    const list = byParent.get(n.parentId) ?? []
    list.push(n)
    byParent.set(n.parentId, list)
  }
  const build = (parentId: string | null, parentPath: string, depth: number): TreeNode[] => {
    const kids = (byParent.get(parentId) ?? []).slice().sort(compareNodes)
    return kids.map((n) => {
      const path = parentPath ? `${parentPath}/${n.name}` : n.name
      return {
        ...n,
        path,
        depth,
        children: n.type === 'folder' ? build(n.id, path, depth + 1) : [],
      }
    })
  }
  return build(null, '', 0)
}

/** Every descendant id of `id` (excluding `id`). */
function descendants(nodes: Map<string, FsNode>, id: string): string[] {
  const out: string[] = []
  const stack = [id]
  while (stack.length) {
    const cur = stack.pop()!
    for (const n of nodes.values()) {
      if (n.parentId === cur) {
        out.push(n.id)
        if (n.type === 'folder') stack.push(n.id)
      }
    }
  }
  return out
}

/** Is `maybeAncestor` an ancestor of (or equal to) `id`? Blocks moving a folder into itself. */
function isAncestor(nodes: Map<string, FsNode>, maybeAncestor: string, id: string): boolean {
  let cur: string | null = id
  while (cur) {
    if (cur === maybeAncestor) return true
    cur = nodes.get(cur)?.parentId ?? null
  }
  return false
}

// ---------------------------------------------------------------------------
// The store: wraps a room's Y.Doc + Y.Map
// ---------------------------------------------------------------------------

export interface Clipboard {
  ids: string[]
  mode: 'copy' | 'cut'
}

export interface FsOps {
  createFile(parentId: string | null, name: string): string
  createFolder(parentId: string | null, name: string): string
  rename(id: string, name: string): void
  remove(id: string): void
  /** Returns null on success, or a reason string when the move is rejected. */
  move(id: string, newParentId: string | null): string | null
  duplicate(id: string): string
  /** Deep-copy a text file's content into an already-created node. */
  uploadFile(parentId: string | null, name: string, content: string): string
  copy(ids: string[]): void
  cut(ids: string[]): void
  paste(targetFolderId: string | null): void
  /** Validation for inline create/rename. null = ok, else user-facing reason. */
  nameError(parentId: string | null, name: string, exceptId?: string): string | null
  /** Ensure a name is unique in a folder by suffixing " copy"/" 2"… (used by paste/duplicate). */
  uniqueName(parentId: string | null, name: string): string
  pathOf(id: string): string
  readText(id: string): string
  node(id: string): FsNode | undefined
}

const ILLEGAL = /[\\/:*?"<>|]/

class FileSystem {
  readonly doc: Y.Doc
  readonly map: Y.Map<FsNode>

  constructor(roomId: string) {
    this.doc = getRoomDoc(roomId).doc
    this.map = this.doc.getMap<FsNode>(FS_MAP)
  }

  snapshot(): Map<string, FsNode> {
    return new Map(this.map.entries())
  }

  node(id: string): FsNode | undefined {
    return this.map.get(id)
  }

  pathOf(id: string): string {
    const parts: string[] = []
    let cur: string | null = id
    const seen = new Set<string>()
    while (cur && !seen.has(cur)) {
      seen.add(cur)
      const n = this.map.get(cur)
      if (!n) break
      parts.unshift(n.name)
      cur = n.parentId
    }
    return parts.join('/')
  }

  readText(id: string): string {
    return this.doc.getText(textKey(id)).toString()
  }

  nameError(parentId: string | null, name: string, exceptId?: string): string | null {
    const trimmed = name.trim()
    if (!trimmed) return 'A name must be provided.'
    if (ILLEGAL.test(trimmed)) return 'The name contains invalid characters (\\ / : * ? " < > |).'
    if (trimmed === '.' || trimmed === '..') return 'That name is not allowed.'
    for (const n of this.map.values()) {
      if (n.parentId === parentId && n.id !== exceptId && n.name.toLowerCase() === trimmed.toLowerCase()) {
        return `A file or folder "${trimmed}" already exists at this location.`
      }
    }
    return null
  }

  uniqueName(parentId: string | null, name: string): string {
    if (!this.nameError(parentId, name)) return name.trim()
    const dot = name.lastIndexOf('.')
    const base = dot > 0 ? name.slice(0, dot) : name
    const ext = dot > 0 ? name.slice(dot) : ''
    // first try "name copy", then "name copy 2", "name copy 3"…
    let candidate = `${base} copy${ext}`
    let i = 2
    while (this.nameError(parentId, candidate)) {
      candidate = `${base} copy ${i}${ext}`
      i++
    }
    return candidate
  }

  createFile(parentId: string | null, name: string): string {
    return this.create(parentId, name.trim(), 'file')
  }

  createFolder(parentId: string | null, name: string): string {
    return this.create(parentId, name.trim(), 'folder')
  }

  private create(parentId: string | null, name: string, type: NodeType): string {
    const err = this.nameError(parentId, name)
    if (err) throw new Error(err)
    const id = uid()
    this.map.set(id, { id, name, parentId, type })
    return id
  }

  uploadFile(parentId: string | null, name: string, content: string): string {
    const finalName = this.uniqueName(parentId, name)
    let id = ''
    this.doc.transact(() => {
      id = uid()
      this.map.set(id, { id, name: finalName, parentId, type: 'file' })
      const t = this.doc.getText(textKey(id))
      if (content) t.insert(0, content)
    })
    return id
  }

  rename(id: string, name: string): void {
    const node = this.map.get(id)
    if (!node) return
    const trimmed = name.trim()
    if (trimmed === node.name) return
    const err = this.nameError(node.parentId, trimmed, id)
    if (err) throw new Error(err)
    this.map.set(id, { ...node, name: trimmed })
  }

  remove(id: string): void {
    const nodes = this.snapshot()
    const ids = [id, ...descendants(nodes, id)]
    this.doc.transact(() => {
      for (const nid of ids) {
        this.map.delete(nid)
        // reclaim content of file nodes (a Y.Text key can't be removed, but clearing frees it)
        const t = this.doc.getText(textKey(nid))
        if (t.length) t.delete(0, t.length)
      }
    })
  }

  move(id: string, newParentId: string | null): string | null {
    const node = this.map.get(id)
    if (!node) return 'Item no longer exists.'
    if (node.parentId === newParentId) return null // no-op
    const nodes = this.snapshot()
    if (newParentId && isAncestor(nodes, id, newParentId)) {
      return 'Cannot move a folder into itself.'
    }
    if (newParentId && nodes.get(newParentId)?.type !== 'folder') {
      return 'Target is not a folder.'
    }
    if (this.nameError(newParentId, node.name, id)) {
      return `A file or folder "${node.name}" already exists in the destination.`
    }
    this.map.set(id, { ...node, parentId: newParentId })
    return null
  }

  duplicate(id: string): string {
    const node = this.map.get(id)
    if (!node) throw new Error('Item no longer exists.')
    const name = this.uniqueName(node.parentId, node.name)
    return this.cloneSubtree(id, node.parentId, name)
  }

  /** Copy a subtree into a target folder, auto-resolving name collisions (used by paste). */
  cloneInto(id: string, targetFolderId: string | null): string {
    const node = this.map.get(id)
    if (!node) throw new Error('Item no longer exists.')
    const name = this.uniqueName(targetFolderId, node.name)
    return this.cloneSubtree(id, targetFolderId, name)
  }

  /** Deep-copy a subtree (new ids, copied text) under `newParentId` with `rootName`. */
  private cloneSubtree(rootId: string, newParentId: string | null, rootName: string): string {
    const nodes = this.snapshot()
    const ids = [rootId, ...descendants(nodes, rootId)]
    const idMap = new Map<string, string>()
    for (const old of ids) idMap.set(old, uid())
    let newRoot = ''
    this.doc.transact(() => {
      for (const old of ids) {
        const src = nodes.get(old)!
        const nid = idMap.get(old)!
        const isRoot = old === rootId
        const parentId = isRoot ? newParentId : idMap.get(src.parentId!)!
        this.map.set(nid, { id: nid, name: isRoot ? rootName : src.name, parentId, type: src.type })
        if (src.type === 'file') {
          const text = this.doc.getText(textKey(old)).toString()
          if (text) this.doc.getText(textKey(nid)).insert(0, text)
        }
        if (isRoot) newRoot = nid
      }
    })
    return newRoot
  }
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

export interface UseFileSystem {
  tree: TreeNode[]
  nodesById: Map<string, FsNode>
  loading: boolean
  clipboard: Clipboard | null
  ops: FsOps
}

/** Subscribe a component to a room's file system. */
export function useFileSystem(roomId: string): UseFileSystem {
  const fs = useMemo(() => new FileSystem(roomId), [roomId])
  const [nodes, setNodes] = useState<Map<string, FsNode>>(() => fs.snapshot())
  const [loading, setLoading] = useState(() => fs.map.size === 0)
  const [clipboard, setClipboard] = useState<Clipboard | null>(null)

  // Live subscription to structural changes.
  useEffect(() => {
    const update = () => setNodes(fs.snapshot())
    fs.map.observe(update)
    update()
    return () => fs.map.unobserve(update)
  }, [fs])

  // Loading = we haven't synced from server/IndexedDB yet AND nothing local.
  // Once persistence/provider report synced, seed a starter project if the room
  // is genuinely empty. Fixed seed ids make concurrent seeding converge.
  useEffect(() => {
    let cancelled = false
    const { provider, persistence } = getRoomDoc(roomId)
    const done = () => {
      if (cancelled) return
      setLoading(false)
      if (fs.map.size === 0) seedProject(fs)
    }
    if (fs.map.size > 0) {
      setLoading(false)
    } else {
      persistence.whenSynced.then(() => {
        if (provider.synced) done()
        else provider.once('sync', done)
      })
      // Fallback: don't wait forever if the server is down.
      const t = setTimeout(done, 2500)
      return () => {
        cancelled = true
        clearTimeout(t)
      }
    }
    return () => {
      cancelled = true
    }
  }, [fs, roomId])

  const tree = useMemo(() => buildTree([...nodes.values()]), [nodes])

  // keep a ref of clipboard so paste always reads the latest without re-creating ops
  const clipboardRef = useRef<Clipboard | null>(null)
  clipboardRef.current = clipboard

  const ops = useMemo<FsOps>(() => {
    const doPaste = (targetFolderId: string | null) => {
      const clip = clipboardRef.current
      if (!clip) return
      for (const id of clip.ids) {
        if (clip.mode === 'cut') {
          fs.move(id, targetFolderId)
        } else {
          if (!fs.node(id)) continue
          fs.cloneInto(id, targetFolderId)
        }
      }
      if (clip.mode === 'cut') {
        clipboardRef.current = null
        setClipboard(null)
      }
    }
    return {
      createFile: (p, n) => fs.createFile(p, n),
      createFolder: (p, n) => fs.createFolder(p, n),
      rename: (id, n) => fs.rename(id, n),
      remove: (id) => fs.remove(id),
      move: (id, p) => fs.move(id, p),
      duplicate: (id) => fs.duplicate(id),
      uploadFile: (p, n, c) => fs.uploadFile(p, n, c),
      copy: (ids) => {
        const clip: Clipboard = { ids, mode: 'copy' }
        clipboardRef.current = clip
        setClipboard(clip)
      },
      cut: (ids) => {
        const clip: Clipboard = { ids, mode: 'cut' }
        clipboardRef.current = clip
        setClipboard(clip)
      },
      paste: doPaste,
      nameError: (p, n, e) => fs.nameError(p, n, e),
      uniqueName: (p, n) => fs.uniqueName(p, n),
      pathOf: (id) => fs.pathOf(id),
      readText: (id) => fs.readText(id),
      node: (id) => fs.node(id),
    }
  }, [fs])

  return { tree, nodesById: nodes, loading, clipboard, ops }
}

// ---------------------------------------------------------------------------
// Starter project (seeded into the doc once, only when the room is empty)
// ---------------------------------------------------------------------------

const SEED_CONTENT: Record<string, string> = {
  'src/index.js': `// Entry point — click ▶ Run to execute (JavaScript).
import { add } from './math.js'

console.log('2 + 3 =', add(2, 3))
`,
  'src/math.js': `export function add(a, b) {
  return a + b
}

export function multiply(a, b) {
  return a * b
}
`,
  'README.md': `# My Project

A sample project inside **Collide**. Edit files live with others.
`,
  'package.json': `{
  "name": "my-project",
  "version": "1.0.0",
  "type": "module"
}
`,
}

/**
 * Seed a minimal project. Uses FIXED ids so if two clients seed concurrently the
 * writes converge to the same nodes (idempotent) rather than duplicating the tree.
 */
function seedProject(fs: FileSystem): void {
  const seed: FsNode[] = [
    { id: 'seed-src', name: 'src', parentId: null, type: 'folder' },
    { id: 'seed-index', name: 'index.js', parentId: 'seed-src', type: 'file' },
    { id: 'seed-math', name: 'math.js', parentId: 'seed-src', type: 'file' },
    { id: 'seed-readme', name: 'README.md', parentId: null, type: 'file' },
    { id: 'seed-pkg', name: 'package.json', parentId: null, type: 'file' },
  ]
  const contentFor: Record<string, string> = {
    'seed-index': SEED_CONTENT['src/index.js'],
    'seed-math': SEED_CONTENT['src/math.js'],
    'seed-readme': SEED_CONTENT['README.md'],
    'seed-pkg': SEED_CONTENT['package.json'],
  }
  fs.doc.transact(() => {
    for (const n of seed) {
      if (!fs.map.has(n.id)) fs.map.set(n.id, n)
      const content = contentFor[n.id]
      if (content) {
        const t = fs.doc.getText(textKey(n.id))
        if (t.length === 0) t.insert(0, content)
      }
    }
  })
}
