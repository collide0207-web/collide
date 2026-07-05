/**
 * VS Code-style Explorer.
 * --------------------------------------------------------------------------
 * Nothing here is hardcoded — every row comes from the Yjs-backed file system
 * (see fileSystem.ts), so create/rename/move/delete are collaborative and live.
 *
 * Implemented: chevron expand/collapse, per-type icons, active/selected/hover
 * states, inline create + rename, full right-click context menu, cut/copy/paste/
 * duplicate, drag-and-drop move (with invalid-move guards + drop indicators),
 * copy path, upload/download, search with fuzzy highlighting, keyboard
 * navigation, auto-expand + auto-scroll to the active file, persisted expansion
 * state, and windowed rendering for large trees.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { FileIcon, FolderIcon } from './fileIcons'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { type TreeNode, type UseFileSystem } from './fileSystem'

interface Props {
  roomId: string
  fs: UseFileSystem
  activeId: string | null
  /** Open a file in the editor. `focus` moves keyboard focus into the editor. */
  onOpen: (id: string, focus?: boolean) => void
  onDeleted?: (id: string) => void
}

const ROW_H = 22
const INDENT = 10
const BASE_PAD = 8
const VIRTUALIZE_OVER = 120 // switch to windowed rendering past this many rows

// A pending "New File / New Folder" input.
interface Draft {
  parentId: string | null
  type: 'file' | 'folder'
}

type Row =
  | { kind: 'node'; node: TreeNode }
  | { kind: 'draft'; parentId: string | null; depth: number; type: 'file' | 'folder' }

// --- fuzzy match: subsequence, returns matched char indices (for highlight) ---
function fuzzy(query: string, text: string): number[] | null {
  if (!query) return []
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  const idx: number[] = []
  let j = 0
  for (let i = 0; i < t.length && j < q.length; i++) {
    if (t[i] === q[j]) {
      idx.push(i)
      j++
    }
  }
  return j === q.length ? idx : null
}

export function FileTree({ roomId, fs, activeId, onOpen, onDeleted }: Props) {
  const { tree, nodesById, loading, clipboard, ops } = fs

  const [expanded, setExpanded] = useState<Set<string>>(() => loadExpanded(roomId))
  const [selectedId, setSelectedId] = useState<string | null>(activeId)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [menu, setMenu] = useState<{ x: number; y: number; nodeId: string | null } | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null) // folder id or 'root'
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [width, setWidth] = useState<number>(() => loadWidth(roomId))
  const [collapsed, setCollapsed] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const errorTimer = useRef<number | undefined>(undefined)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportH, setViewportH] = useState(400)

  // Drag the right edge to resize the explorer; width is persisted per room.
  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const startW = width
      const onMove = (ev: MouseEvent) => {
        const w = Math.min(560, Math.max(170, startW + (ev.clientX - startX)))
        setWidth(w)
      }
      const onUp = () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [width],
  )

  useEffect(() => saveWidth(roomId, width), [roomId, width])

  const persistExpanded = useCallback(
    (next: Set<string>) => {
      setExpanded(next)
      saveExpanded(roomId, next)
    },
    [roomId],
  )

  const toggle = useCallback(
    (id: string) => {
      const next = new Set(expanded)
      next.has(id) ? next.delete(id) : next.add(id)
      persistExpanded(next)
    },
    [expanded, persistExpanded],
  )

  const expand = useCallback(
    (ids: string[]) => {
      const next = new Set(expanded)
      let changed = false
      for (const id of ids) if (!next.has(id)) (next.add(id), (changed = true))
      if (changed) persistExpanded(next)
    },
    [expanded, persistExpanded],
  )

  const ancestorsOf = useCallback(
    (id: string): string[] => {
      const out: string[] = []
      let cur = nodesById.get(id)?.parentId ?? null
      while (cur) {
        out.push(cur)
        cur = nodesById.get(cur)?.parentId ?? null
      }
      return out
    },
    [nodesById],
  )

  // Auto-expand the parents of the active file so it's always revealed.
  useEffect(() => {
    if (activeId) {
      setSelectedId(activeId)
      expand(ancestorsOf(activeId))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId])

  const flash = useCallback((msg: string) => {
    setError(msg)
    window.clearTimeout(errorTimer.current)
    errorTimer.current = window.setTimeout(() => setError(null), 3200)
  }, [])

  // ---- filtering (search) --------------------------------------------------
  const { visibleIds, matches } = useMemo(() => {
    if (!query.trim()) return { visibleIds: null as Set<string> | null, matches: new Map<string, number[]>() }
    const vis = new Set<string>()
    const m = new Map<string, number[]>()
    const walk = (nodes: TreeNode[]): boolean => {
      let any = false
      for (const n of nodes) {
        const hit = fuzzy(query.trim(), n.name)
        const childHit = n.children.length ? walk(n.children) : false
        if (hit || childHit) {
          vis.add(n.id)
          if (hit) m.set(n.id, hit)
          any = true
        }
      }
      return any
    }
    walk(tree)
    return { visibleIds: vis, matches: m }
  }, [query, tree])

  // ---- flatten to rows (respecting expansion / draft / filter) -------------
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = []
    const filtering = !!visibleIds
    const pushChildren = (nodes: TreeNode[], parentId: string | null, depth: number) => {
      // draft at the top of its parent's children
      if (draft && draft.parentId === parentId) {
        out.push({ kind: 'draft', parentId, depth, type: draft.type })
      }
      for (const n of nodes) {
        if (filtering && !visibleIds!.has(n.id)) continue
        out.push({ kind: 'node', node: n })
        const isOpen = filtering ? true : expanded.has(n.id)
        if (n.type === 'folder' && isOpen) pushChildren(n.children, n.id, depth + 1)
      }
    }
    pushChildren(tree, null, 0)
    return out
  }, [tree, expanded, draft, visibleIds])

  const nodeRows = useMemo(() => rows.filter((r): r is Extract<Row, { kind: 'node' }> => r.kind === 'node'), [rows])

  // ---- virtualization ------------------------------------------------------
  const virtual = rows.length > VIRTUALIZE_OVER
  const overscan = 10
  const start = virtual ? Math.max(0, Math.floor(scrollTop / ROW_H) - overscan) : 0
  const end = virtual ? Math.min(rows.length, Math.ceil((scrollTop + viewportH) / ROW_H) + overscan) : rows.length
  const visibleRows = rows.slice(start, end)
  const padTop = start * ROW_H
  const padBottom = (rows.length - end) * ROW_H

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    setViewportH(el.clientHeight)
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Auto-scroll to the active file when it changes.
  useEffect(() => {
    if (!activeId) return
    const i = rows.findIndex((r) => r.kind === 'node' && r.node.id === activeId)
    if (i < 0) return
    const el = scrollRef.current
    if (!el) return
    const top = i * ROW_H
    const bottom = top + ROW_H
    if (top < el.scrollTop) el.scrollTop = top
    else if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, rows.length])

  // ---- operations ----------------------------------------------------------
  /** Where a new file/folder should be created based on the given/selected node. */
  const targetFolder = useCallback(
    (nodeId: string | null): string | null => {
      if (!nodeId) return null
      const n = nodesById.get(nodeId)
      if (!n) return null
      return n.type === 'folder' ? n.id : n.parentId
    },
    [nodesById],
  )

  const beginCreate = useCallback(
    (parentId: string | null, type: 'file' | 'folder') => {
      if (parentId) expand([parentId])
      setDraft({ parentId, type })
      setRenamingId(null)
    },
    [expand],
  )

  const commitCreate = useCallback(
    (name: string) => {
      if (!draft) return
      const trimmed = name.trim()
      if (!trimmed) {
        setDraft(null)
        return
      }
      const err = ops.nameError(draft.parentId, trimmed)
      if (err) {
        flash(err)
        return // keep the input open so the user can fix it
      }
      try {
        const id =
          draft.type === 'file'
            ? ops.createFile(draft.parentId, trimmed)
            : ops.createFolder(draft.parentId, trimmed)
        setDraft(null)
        setSelectedId(id)
        if (draft.type === 'file') onOpen(id, true) // open + focus cursor in editor
        else expand([id])
      } catch (e) {
        flash((e as Error).message)
      }
    },
    [draft, ops, onOpen, expand],
  )

  const commitRename = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim()
      const node = nodesById.get(id)
      if (!node || trimmed === node.name || !trimmed) {
        setRenamingId(null)
        return
      }
      const err = ops.nameError(node.parentId, trimmed, id)
      if (err) {
        flash(err)
        return
      }
      try {
        ops.rename(id, trimmed)
        setRenamingId(null)
      } catch (e) {
        flash((e as Error).message)
      }
    },
    [nodesById, ops],
  )

  const doDelete = useCallback(
    (id: string) => {
      const node = nodesById.get(id)
      if (!node) return
      const label = node.type === 'folder' ? `folder "${node.name}" and its contents` : `"${node.name}"`
      if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return
      ops.remove(id)
      onDeleted?.(id)
      if (selectedId === id) setSelectedId(null)
    },
    [nodesById, ops, onDeleted, selectedId],
  )

  const doDownload = useCallback(
    (id: string) => {
      const node = nodesById.get(id)
      if (!node || node.type !== 'file') return
      const blob = new Blob([ops.readText(id)], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = node.name
      a.click()
      URL.revokeObjectURL(url)
    },
    [nodesById, ops],
  )

  const onUploadPicked = useCallback(
    async (files: FileList | null, parentId: string | null) => {
      if (!files) return
      for (const file of Array.from(files)) {
        const text = await file.text().catch(() => '')
        ops.uploadFile(parentId, file.name, text)
      }
    },
    [ops],
  )

  const copyPath = (id: string, relative: boolean) => {
    const p = ops.pathOf(id)
    navigator.clipboard?.writeText(relative ? p : `/${p}`).catch(() => {})
  }

  const refresh = useCallback(() => {
    setRefreshing(true)
    // The doc is the source of truth; "refresh" re-reads it and clears transient UI.
    setQuery('')
    setMenu(null)
    setTimeout(() => setRefreshing(false), 400)
  }, [])

  const selectAndOpen = useCallback(
    (node: TreeNode, focusEditor = false) => {
      setSelectedId(node.id)
      if (node.type === 'folder') toggle(node.id)
      else onOpen(node.id, focusEditor)
    },
    [toggle, onOpen],
  )

  // ---- keyboard navigation -------------------------------------------------
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (draft || renamingId) return
    const idx = selectedId ? nodeRows.findIndex((r) => r.node.id === selectedId) : -1
    const cur = idx >= 0 ? nodeRows[idx].node : null

    const select = (n: TreeNode | undefined) => {
      if (!n) return
      setSelectedId(n.id)
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      select(nodeRows[Math.min(nodeRows.length - 1, idx + 1)]?.node)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      select(nodeRows[Math.max(0, idx - 1)]?.node)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      if (cur?.type === 'folder') {
        if (!expanded.has(cur.id)) expand([cur.id])
        else select(cur.children[0])
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      if (cur?.type === 'folder' && expanded.has(cur.id)) toggle(cur.id)
      else if (cur?.parentId) select(nodesById.get(cur.parentId) as TreeNode | undefined)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (cur) selectAndOpen(cur, true) // Enter moves focus into the editor
    } else if (e.key === 'F2') {
      e.preventDefault()
      if (cur) setRenamingId(cur.id)
    } else if (e.key === 'Delete') {
      e.preventDefault()
      if (cur) doDelete(cur.id)
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
      if (cur) ops.copy([cur.id])
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
      if (cur) ops.cut([cur.id])
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
      if (cur) ops.paste(targetFolder(cur.id))
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
      e.preventDefault()
      if (cur) ops.duplicate(cur.id)
    }
  }

  // ---- drag & drop ---------------------------------------------------------
  const folderTargetOf = (node: TreeNode) => (node.type === 'folder' ? node.id : node.parentId)

  const onDrop = (targetFolderId: string | null) => {
    setDropTarget(null)
    if (!dragId) return
    const reason = ops.move(dragId, targetFolderId)
    if (reason) flash(reason)
    else if (targetFolderId) expand([targetFolderId])
    setDragId(null)
  }

  // ---- context menu --------------------------------------------------------
  const buildMenu = (nodeId: string | null): MenuItem[] => {
    const node = nodeId ? nodesById.get(nodeId) : null
    const folderFor = node ? folderTargetOf(node as TreeNode) : null
    const canPaste = !!clipboard
    const items: MenuItem[] = [
      { label: 'New File…', onClick: () => beginCreate(node ? targetFolder(nodeId) : null, 'file') },
      { label: 'New Folder…', onClick: () => beginCreate(node ? targetFolder(nodeId) : null, 'folder') },
      { label: 'Upload…', onClick: () => uploadRef.current?.click() },
      { separator: true, label: '' },
    ]
    if (node) {
      items.push(
        { label: 'Cut', hint: 'Ctrl+X', onClick: () => ops.cut([node.id]) },
        { label: 'Copy', hint: 'Ctrl+C', onClick: () => ops.copy([node.id]) },
      )
    }
    items.push({
      label: 'Paste',
      hint: 'Ctrl+V',
      disabled: !canPaste,
      onClick: () => ops.paste(node ? folderFor : null),
    })
    if (node) {
      items.push(
        { separator: true, label: '' },
        { label: 'Copy Path', onClick: () => copyPath(node.id, false) },
        { label: 'Copy Relative Path', onClick: () => copyPath(node.id, true) },
        { separator: true, label: '' },
        { label: 'Rename…', hint: 'F2', onClick: () => setRenamingId(node.id) },
        { label: 'Duplicate', hint: 'Ctrl+D', onClick: () => ops.duplicate(node.id) },
        { label: 'Delete', hint: 'Del', danger: true, onClick: () => doDelete(node.id) },
      )
      if (node.type === 'file') {
        items.push({ separator: true, label: '' }, { label: 'Download', onClick: () => doDownload(node.id) })
      }
    }
    items.push(
      { separator: true, label: '' },
      { label: 'Collapse All', onClick: () => persistExpanded(new Set()) },
      { label: 'Refresh Explorer', onClick: refresh },
    )
    return items
  }

  // -------------------------------------------------------------------------
  // Minimized: a slim rail with a single button to reopen the explorer.
  if (collapsed) {
    return (
      <div className="file-tree collapsed">
        <button className="ft-rail-btn" title="Open Explorer" onClick={() => setCollapsed(false)}>
          <FilesIcon />
        </button>
      </div>
    )
  }

  const header = (
    <ExplorerHeader
      onNewFile={() => beginCreate(targetFolder(selectedId), 'file')}
      onNewFolder={() => beginCreate(targetFolder(selectedId), 'folder')}
      onRefresh={refresh}
      onCollapse={() => persistExpanded(new Set())}
      onUpload={() => uploadRef.current?.click()}
      onMinimize={() => setCollapsed(true)}
      refreshing={refreshing}
    />
  )
  const resizer = <div className="ft-resizer" onMouseDown={startResize} title="Drag to resize" />

  if (loading) {
    return (
      <div className="file-tree" style={{ width }}>
        {header}
        <div className="ft-loading">
          <span className="ft-spinner" /> Loading files…
        </div>
        {resizer}
      </div>
    )
  }

  return (
    <div className="file-tree" style={{ width }} onContextMenu={(e) => e.preventDefault()}>
      {header}

      <div className="ft-search">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search files"
          spellCheck={false}
          onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
        />
      </div>

      {error && <div className="ft-error" role="alert">{error}</div>}

      <div
        ref={scrollRef}
        className={`ft-list ${dropTarget === 'root' ? 'drop-root' : ''}`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onScroll={(e) => virtual && setScrollTop((e.target as HTMLDivElement).scrollTop)}
        onContextMenu={(e) => {
          // context menu on empty space
          if (e.target === e.currentTarget) {
            e.preventDefault()
            setMenu({ x: e.clientX, y: e.clientY, nodeId: null })
          }
        }}
        onDragOver={(e) => {
          if (dragId) {
            e.preventDefault()
            setDropTarget('root')
          }
        }}
        onDragLeave={(e) => {
          if (e.target === e.currentTarget) setDropTarget(null)
        }}
        onDrop={(e) => {
          e.preventDefault()
          onDrop(null)
        }}
      >
        {rows.length === 0 && !draft ? (
          <div className="ft-empty">
            <p>No files yet.</p>
            <button className="ft-empty-btn" onClick={() => beginCreate(null, 'file')}>New File</button>
            <button className="ft-empty-btn" onClick={() => beginCreate(null, 'folder')}>New Folder</button>
          </div>
        ) : (
          <div style={{ paddingTop: padTop, paddingBottom: padBottom }}>
            {visibleRows.map((row) => {
              if (row.kind === 'draft') {
                return (
                  <InlineInput
                    key="__draft__"
                    depth={row.depth}
                    type={row.type}
                    initial=""
                    onCommit={commitCreate}
                    onCancel={() => setDraft(null)}
                  />
                )
              }
              const node = row.node
              const isFolder = node.type === 'folder'
              const isOpen = visibleIds ? true : expanded.has(node.id)
              if (renamingId === node.id) {
                return (
                  <InlineInput
                    key={node.id}
                    depth={node.depth}
                    type={node.type}
                    initial={node.name}
                    onCommit={(name) => commitRename(node.id, name)}
                    onCancel={() => setRenamingId(null)}
                  />
                )
              }
              return (
                <div
                  key={node.id}
                  className={
                    'ft-item' +
                    (isFolder ? ' ft-folder' : ' ft-file') +
                    (activeId === node.id ? ' active' : '') +
                    (selectedId === node.id ? ' selected' : '') +
                    (dragId === node.id ? ' dragging' : '') +
                    (dropTarget === node.id ? ' drop-into' : '') +
                    (clipboard?.mode === 'cut' && clipboard.ids.includes(node.id) ? ' cut' : '')
                  }
                  style={{ paddingLeft: BASE_PAD + node.depth * INDENT, height: ROW_H }}
                  title={node.path}
                  draggable
                  onMouseDown={() => scrollRef.current?.focus({ preventScroll: true })}
                  onClick={() => selectAndOpen(node)}
                  onDoubleClick={() => node.type === 'file' && onOpen(node.id, true)}
                  onDragStart={(e) => {
                    setDragId(node.id)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragEnd={() => {
                    setDragId(null)
                    setDropTarget(null)
                  }}
                  onDragOver={(e) => {
                    if (!dragId || dragId === node.id) return
                    e.preventDefault()
                    e.stopPropagation()
                    setDropTarget(folderTargetOf(node) ?? 'root')
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onDrop(folderTargetOf(node))
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setSelectedId(node.id)
                    setMenu({ x: e.clientX, y: e.clientY, nodeId: node.id })
                  }}
                >
                  <span className="ft-caret" onClick={(e) => { e.stopPropagation(); if (isFolder) toggle(node.id) }}>
                    {isFolder ? (isOpen ? <Chevron open /> : <Chevron />) : null}
                  </span>
                  <span className="ft-ico">
                    {isFolder ? <FolderIcon open={isOpen} /> : <FileIcon name={node.name} />}
                  </span>
                  <span className="ft-name">{highlight(node.name, matches.get(node.id))}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={buildMenu(menu.nodeId)} onClose={() => setMenu(null)} />
      )}

      <input
        ref={uploadRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          onUploadPicked(e.target.files, targetFolder(selectedId))
          e.target.value = ''
        }}
      />

      {resizer}
    </div>
  )
}

// --- header with toolbar actions -------------------------------------------
function ExplorerHeader(props: {
  onNewFile: () => void
  onNewFolder: () => void
  onRefresh: () => void
  onCollapse: () => void
  onUpload: () => void
  onMinimize: () => void
  refreshing: boolean
}) {
  return (
    <div className="ft-header">
      <span className="ft-title">EXPLORER</span>
      <span className="ft-actions">
        <button title="New File" onClick={props.onNewFile}><NewFileIcon /></button>
        <button title="New Folder" onClick={props.onNewFolder}><NewFolderIcon /></button>
        <button title="Upload File" onClick={props.onUpload}><UploadIcon /></button>
        <button title="Refresh Explorer" onClick={props.onRefresh} className={props.refreshing ? 'spin' : ''}><RefreshIcon /></button>
        <button title="Collapse Folders" onClick={props.onCollapse}><CollapseIcon /></button>
        <button title="Minimize Explorer" onClick={props.onMinimize}><MinimizeExplorerIcon /></button>
      </span>
    </div>
  )
}

// --- inline create / rename input ------------------------------------------
function InlineInput({
  depth,
  type,
  initial,
  onCommit,
  onCancel,
}: {
  depth: number
  type: 'file' | 'folder'
  initial: string
  onCommit: (name: string) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const committed = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    // Select the base name (before extension), like VS Code.
    const dot = initial.lastIndexOf('.')
    if (dot > 0) el.setSelectionRange(0, dot)
    else el.select()
  }, [initial])

  const commit = () => {
    if (committed.current) return
    committed.current = true
    onCommit(ref.current?.value ?? '')
  }

  return (
    <div className="ft-item ft-input-row" style={{ paddingLeft: BASE_PAD + depth * INDENT, height: ROW_H }}>
      <span className="ft-caret" />
      <span className="ft-ico">{type === 'folder' ? <FolderIcon open={false} /> : <FileIcon name={initial || 'x'} />}</span>
      <input
        ref={ref}
        className="ft-inline-input"
        defaultValue={initial}
        spellCheck={false}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          else if (e.key === 'Escape') { e.preventDefault(); committed.current = true; onCancel() }
        }}
        onBlur={commit}
      />
    </div>
  )
}

// --- highlight fuzzy matches ------------------------------------------------
function highlight(name: string, idxs?: number[]) {
  if (!idxs || idxs.length === 0) return name
  const set = new Set(idxs)
  return (
    <>
      {name.split('').map((ch, i) =>
        set.has(i) ? <mark key={i} className="ft-match">{ch}</mark> : ch,
      )}
    </>
  )
}

// --- expansion persistence --------------------------------------------------
function keyFor(roomId: string) {
  return `collide-fs-expanded-${roomId}`
}
function loadExpanded(roomId: string): Set<string> {
  try {
    const raw = localStorage.getItem(keyFor(roomId))
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set(['seed-src'])
  } catch {
    return new Set()
  }
}
function saveExpanded(roomId: string, set: Set<string>) {
  try {
    localStorage.setItem(keyFor(roomId), JSON.stringify([...set]))
  } catch {
    /* ignore quota */
  }
}
const DEFAULT_WIDTH = 230
function loadWidth(roomId: string): number {
  try {
    const raw = localStorage.getItem(`collide-fs-width-${roomId}`)
    const n = raw ? parseInt(raw, 10) : NaN
    return Number.isFinite(n) ? Math.min(560, Math.max(170, n)) : DEFAULT_WIDTH
  } catch {
    return DEFAULT_WIDTH
  }
}
function saveWidth(roomId: string, w: number) {
  try {
    localStorage.setItem(`collide-fs-width-${roomId}`, String(w))
  } catch {
    /* ignore quota */
  }
}

// --- tiny inline icons ------------------------------------------------------
function Chevron({ open }: { open?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" className={`ft-chevron ${open ? 'open' : ''}`} aria-hidden>
      <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
const svgProps = { viewBox: '0 0 16 16', width: 15, height: 15, 'aria-hidden': true } as const
function NewFileIcon() {
  return (
    <svg {...svgProps}><path d="M4 1.5h4L11.5 5v9a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5V2a.5.5 0 0 1 .5-.5z" fill="none" stroke="currentColor" strokeWidth="1" /><path d="M8 1.5V5h3.5" fill="none" stroke="currentColor" strokeWidth="1" /><path d="M7.2 8v3M5.7 9.5h3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" /></svg>
  )
}
function NewFolderIcon() {
  return (
    <svg {...svgProps}><path d="M1.5 4a1 1 0 0 1 1-1H6l1.2 1.2h6.3a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" strokeWidth="1" /><path d="M9.4 8.4v2.6M8.1 9.7h2.6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" /></svg>
  )
}
function RefreshIcon() {
  return (
    <svg {...svgProps}><path d="M13 8a5 5 0 1 1-1.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" /><path d="M13 2v3h-3" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" /></svg>
  )
}
function CollapseIcon() {
  return (
    <svg {...svgProps}><path d="M3 5.5l3-3 3 3M3 10.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" /><path d="M12 4.5h2M12 11.5h2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" /></svg>
  )
}
function UploadIcon() {
  return (
    <svg {...svgProps}><path d="M8 10V3M5.2 5.3L8 2.5l2.8 2.8" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" /><path d="M3 11.5v1a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" /></svg>
  )
}
function MinimizeExplorerIcon() {
  // A "collapse to the left" chevron — minimizes the whole explorer panel.
  return (
    <svg {...svgProps}><path d="M9.5 4l-4 4 4 4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /><path d="M12 3.5v9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
  )
}
function FilesIcon() {
  // Shown on the collapsed rail to reopen the explorer.
  return (
    <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden><path d="M4 1.8h4L11 4.8V13a.6.6 0 0 1-.6.6H4a.6.6 0 0 1-.6-.6V2.4A.6.6 0 0 1 4 1.8z" fill="none" stroke="currentColor" strokeWidth="1.1" /><path d="M8 1.8V5h3" fill="none" stroke="currentColor" strokeWidth="1.1" /></svg>
  )
}
