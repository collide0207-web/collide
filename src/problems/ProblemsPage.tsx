import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useSession } from '../store/session'
import type { Difficulty, ProblemStatus, ProblemSummary, UserProgress } from '../api/types'

type SortKey = 'default' | 'title' | 'difficulty' | 'category' | 'solved-first'
const DIFF_ORDER: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2 }
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']
const STATUSES: ProblemStatus[] = ['solved', 'attempted', 'unsolved']

/** NeetCode 150 browser: search, filter, sort, category sidebar, grid/table views. */
export function ProblemsPage() {
  const navigate = useNavigate()
  const user = useSession((s) => s.user)

  const [problems, setProblems] = useState<ProblemSummary[]>([])
  const [progress, setProgress] = useState<Record<string, UserProgress>>({})
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [diffFilter, setDiffFilter] = useState<Set<Difficulty>>(new Set())
  const [statusFilter, setStatusFilter] = useState<Set<ProblemStatus>>(new Set())
  const [catFilter, setCatFilter] = useState<Set<string>>(new Set())
  const [favOnly, setFavOnly] = useState(false)
  const [sort, setSort] = useState<SortKey>('default')
  const [view, setView] = useState<'grid' | 'table'>('grid')
  const [sidebarOpen, setSidebarOpen] = useState(true)

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const [probs, cats] = await Promise.all([api.getProblems(), api.getProblemCategories()])
        let prog: UserProgress[] = []
        try { prog = await api.getAllProgress() } catch { /* best-effort */ }
        if (!live) return
        setProblems(probs)
        setCategories(cats)
        setProgress(Object.fromEntries(prog.map((p) => [p.problemId, p])))
      } finally {
        if (live) setLoading(false)
      }
    })()
    return () => { live = false }
  }, [])

  const statusOf = (p: ProblemSummary): ProblemStatus => progress[p.id]?.status ?? 'unsolved'
  const isFav = (p: ProblemSummary) => !!progress[p.id]?.favorite

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = problems.filter((p) => {
      if (q && !(p.title.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) ||
        p.difficulty.includes(q) || p.tags.some((t) => t.toLowerCase().includes(q)))) return false
      if (diffFilter.size && !diffFilter.has(p.difficulty)) return false
      if (statusFilter.size && !statusFilter.has(statusOf(p))) return false
      if (catFilter.size && !catFilter.has(p.category)) return false
      if (favOnly && !isFav(p)) return false
      return true
    })
    list = [...list].sort((a, b) => {
      switch (sort) {
        case 'title': return a.title.localeCompare(b.title)
        case 'difficulty': return DIFF_ORDER[a.difficulty] - DIFF_ORDER[b.difficulty]
        case 'category': return a.category.localeCompare(b.category)
        case 'solved-first': return (statusOf(b) === 'solved' ? 1 : 0) - (statusOf(a) === 'solved' ? 1 : 0)
        default: return a.order - b.order
      }
    })
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problems, progress, search, diffFilter, statusFilter, catFilter, favOnly, sort])

  const solvedCount = problems.filter((p) => statusOf(p) === 'solved').length
  const pct = problems.length ? Math.round((solvedCount / problems.length) * 100) : 0

  // Per-category solved/total for the sidebar.
  const catStats = useMemo(() => {
    const m = new Map<string, { total: number; solved: number }>()
    for (const p of problems) {
      const s = m.get(p.category) || { total: 0, solved: 0 }
      s.total++
      if (statusOf(p) === 'solved') s.solved++
      m.set(p.category, s)
    }
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problems, progress])

  function toggle<T>(set: Set<T>, v: T, apply: (s: Set<T>) => void) {
    const next = new Set(set)
    next.has(v) ? next.delete(v) : next.add(v)
    apply(next)
  }

  async function toggleFav(e: React.MouseEvent, p: ProblemSummary) {
    e.stopPropagation()
    const next = !isFav(p)
    setProgress((cur) => ({ ...cur, [p.id]: { ...(cur[p.id] || emptyProgress(p.id)), favorite: next } }))
    try { await api.setFavorite(p.id, next) } catch { /* revert on failure */
      setProgress((cur) => ({ ...cur, [p.id]: { ...(cur[p.id] || emptyProgress(p.id)), favorite: !next } }))
    }
  }

  return (
    <div className="problems-page">
      <div className="topbar">
        <span className="title"><span className="brand-logo">◆</span> Collide</span>
        <span className="mode-chip">NeetCode 150</span>
        <span className="spacer" />
        <span className="hello">{user?.name}</span>
        <button className="btn-ghost" onClick={() => navigate('/home')}>← Home</button>
      </div>

      <div className="problems-body">
        <aside className={`cat-sidebar ${sidebarOpen ? '' : 'collapsed'}`}>
          <button className="cat-toggle" onClick={() => setSidebarOpen((v) => !v)} title="Toggle categories">
            {sidebarOpen ? '«' : '»'}
          </button>
          {sidebarOpen && (
            <div className="cat-list">
              <div className="cat-progress-top">
                <div className="cat-progress-label"><span>Overall</span><span>{solvedCount}/{problems.length}</span></div>
                <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
              </div>
              {categories.map((c) => {
                const s = catStats.get(c) || { total: 0, solved: 0 }
                const cp = s.total ? Math.round((s.solved / s.total) * 100) : 0
                return (
                  <button
                    key={c}
                    className={`cat-item ${catFilter.has(c) ? 'active' : ''}`}
                    onClick={() => toggle(catFilter, c, setCatFilter)}
                  >
                    <div className="cat-item-label"><span>{c}</span><span>{s.solved}/{s.total}</span></div>
                    <div className="progress-bar sm"><div className="progress-fill" style={{ width: `${cp}%` }} /></div>
                  </button>
                )
              })}
            </div>
          )}
        </aside>

        <main className="problems-main">
          <div className="problems-toolbar">
            <input
              className="prob-search"
              placeholder="Search by title, topic, difficulty, tag…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="filter-group">
              {DIFFICULTIES.map((d) => (
                <button key={d} className={`chip ${d} ${diffFilter.has(d) ? 'active' : ''}`} onClick={() => toggle(diffFilter, d, setDiffFilter)}>{d}</button>
              ))}
            </div>
            <div className="filter-group">
              {STATUSES.map((s) => (
                <button key={s} className={`chip ${statusFilter.has(s) ? 'active' : ''}`} onClick={() => toggle(statusFilter, s, setStatusFilter)}>{s}</button>
              ))}
            </div>
            <button className={`chip ${favOnly ? 'active' : ''}`} onClick={() => setFavOnly((v) => !v)}>★ Favorites</button>
            <span className="spacer" />
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} title="Sort">
              <option value="default">Sort: Default</option>
              <option value="title">Name</option>
              <option value="difficulty">Difficulty</option>
              <option value="category">Category</option>
              <option value="solved-first">Solved first</option>
            </select>
            <div className="view-toggle">
              <button className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')} title="Grid">▦</button>
              <button className={view === 'table' ? 'active' : ''} onClick={() => setView('table')} title="Table">≣</button>
            </div>
          </div>

          {loading ? (
            <div className="prob-loading">Loading problems…</div>
          ) : filtered.length === 0 ? (
            <div className="prob-empty">No problems match your filters.</div>
          ) : view === 'grid' ? (
            <div className="prob-grid">
              {filtered.map((p) => (
                <button key={p.id} className="prob-card" onClick={() => navigate(`/problems/${p.slug}`)}>
                  <div className="prob-card-top">
                    <span className={`status-dot ${statusOf(p)}`} title={statusOf(p)} />
                    <span className="prob-card-title">{p.title}</span>
                    <span className={`fav ${isFav(p) ? 'on' : ''}`} onClick={(e) => toggleFav(e, p)} title="Favorite">★</span>
                  </div>
                  <div className="prob-card-meta">
                    <span className={`diff-badge ${p.difficulty}`}>{p.difficulty}</span>
                    <span className="cat-badge">{p.category}</span>
                  </div>
                  <div className="prob-tags">{p.tags.slice(0, 3).map((t) => <span key={t} className="tag">{t}</span>)}</div>
                </button>
              ))}
            </div>
          ) : (
            <table className="prob-table">
              <thead>
                <tr><th>Status</th><th>Title</th><th>Difficulty</th><th>Category</th><th>★</th></tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} onClick={() => navigate(`/problems/${p.slug}`)}>
                    <td><span className={`status-dot ${statusOf(p)}`} /></td>
                    <td className="cell-title">{p.title}</td>
                    <td><span className={`diff-badge ${p.difficulty}`}>{p.difficulty}</span></td>
                    <td>{p.category}</td>
                    <td><span className={`fav ${isFav(p) ? 'on' : ''}`} onClick={(e) => toggleFav(e, p)}>★</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </main>
      </div>
    </div>
  )
}

function emptyProgress(problemId: string): UserProgress {
  return { problemId, status: 'unsolved', language: null, code: {}, favorite: false, completed: false, timeSpent: 0, attemptCount: 0, runCount: 0, lastOpened: null, updatedAt: null }
}
