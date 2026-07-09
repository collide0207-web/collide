import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useSession } from '../store/session'
import type { Difficulty, ProblemSummary, UserProgress } from '../api/types'

const DIFFS: Difficulty[] = ['easy', 'medium', 'hard']

/**
 * Practice hub: overall + per-difficulty progress, recently solved, continue
 * solving (most recently opened, still unsolved), and favorites. Built purely
 * from getProblems + getAllProgress so it stays in sync with the sheet.
 */
export function DashboardPage() {
  const navigate = useNavigate()
  const user = useSession((s) => s.user)

  const [problems, setProblems] = useState<ProblemSummary[]>([])
  const [progress, setProgress] = useState<UserProgress[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const probs = await api.getProblems()
        let prog: UserProgress[] = []
        try { prog = await api.getAllProgress() } catch { /* best-effort */ }
        if (!live) return
        setProblems(probs)
        setProgress(prog)
      } finally {
        if (live) setLoading(false)
      }
    })()
    return () => { live = false }
  }, [])

  const byId = useMemo(() => new Map(problems.map((p) => [p.id, p])), [problems])
  const progById = useMemo(() => new Map(progress.map((p) => [p.problemId, p])), [progress])

  const stats = useMemo(() => {
    const total = problems.length
    const solved = problems.filter((p) => progById.get(p.id)?.status === 'solved').length
    const attempted = problems.filter((p) => progById.get(p.id)?.status === 'attempted').length
    const perDiff = DIFFS.map((d) => {
      const all = problems.filter((p) => p.difficulty === d)
      const done = all.filter((p) => progById.get(p.id)?.status === 'solved').length
      return { d, total: all.length, done }
    })
    return { total, solved, attempted, pct: total ? Math.round((solved / total) * 100) : 0, perDiff }
  }, [problems, progById])

  const sortedProg = (filter: (p: UserProgress) => boolean, key: (p: UserProgress) => string | null) =>
    progress
      .filter(filter)
      .filter((p) => byId.has(p.problemId))
      .sort((a, b) => (key(b) || '').localeCompare(key(a) || ''))
      .slice(0, 6)

  const recentlySolved = sortedProg((p) => p.status === 'solved', (p) => p.updatedAt)
  const continueSolving = sortedProg((p) => p.status !== 'solved' && !!p.lastOpened, (p) => p.lastOpened)
  const favorites = sortedProg((p) => p.favorite, (p) => p.updatedAt)

  const go = (problemId: string) => {
    const p = byId.get(problemId)
    if (p) navigate(`/problems/${p.slug}`)
  }

  const Item = ({ pr }: { pr: UserProgress }) => {
    const p = byId.get(pr.problemId)
    if (!p) return null
    return (
      <button className="dash-item" onClick={() => go(pr.problemId)}>
        <span className={`status-dot ${pr.status}`} />
        <span className="dash-item-title">{p.title}</span>
        <span className={`diff-badge ${p.difficulty}`}>{p.difficulty}</span>
      </button>
    )
  }

  return (
    <div className="dash-page">
      <div className="topbar">
        <span className="title"><span className="brand-logo">◆</span> Collide</span>
        <span className="mode-chip">Practice</span>
        <span className="spacer" />
        <span className="hello">Hi, {user?.name}</span>
        <button className="btn-ghost" onClick={() => navigate('/home')}>← Home</button>
      </div>

      <div className="dash-body">
        {loading ? (
          <div className="prob-loading">Loading…</div>
        ) : (
          <>
            <div className="dash-hero">
              <div>
                <h1>NeetCode 150</h1>
                <p className="muted">Work through the 150 essential patterns. Pick up where you left off.</p>
              </div>
              <button className="run-btn" onClick={() => navigate('/problems')}>Open the sheet →</button>
            </div>

            <div className="dash-grid">
              <section className="dash-card wide">
                <h2>Progress</h2>
                <div className="dash-overall">
                  <div className="dash-ring" style={{ '--pct': `${stats.pct}` } as React.CSSProperties}>
                    <span>{stats.pct}%</span>
                  </div>
                  <div className="dash-overall-side">
                    <div className="dash-big">{stats.solved}<span> / {stats.total} solved</span></div>
                    <div className="dash-diffs">
                      {stats.perDiff.map(({ d, total, done }) => (
                        <div key={d} className="dash-diff-row">
                          <span className={`diff-badge ${d}`}>{d}</span>
                          <div className="progress-bar"><div className="progress-fill" style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
                          <span className="dash-diff-count">{done}/{total}</span>
                        </div>
                      ))}
                    </div>
                    <div className="dash-substat">{stats.attempted} attempted · {favorites.length} favorited</div>
                  </div>
                </div>
              </section>

              <DashList title="Continue solving" items={continueSolving} empty="Nothing in progress — open a problem to start." Item={Item} />
              <DashList title="Recently solved" items={recentlySolved} empty="No solved problems yet." Item={Item} />
              <DashList title="Favorites" items={favorites} empty="Star problems to pin them here." Item={Item} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function DashList({ title, items, empty, Item }: {
  title: string
  items: UserProgress[]
  empty: string
  Item: (props: { pr: UserProgress }) => React.ReactNode
}) {
  return (
    <section className="dash-card">
      <h2>{title}</h2>
      {items.length === 0 ? (
        <p className="dash-empty">{empty}</p>
      ) : (
        <div className="dash-list">{items.map((pr) => <Item key={pr.problemId} pr={pr} />)}</div>
      )}
    </section>
  )
}
