import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useSession } from '../store/session'

export function LoginPage() {
  const navigate = useNavigate()
  const setSession = useSession((s) => s.setSession)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)

  async function start() {
    if (!name.trim()) return
    setBusy(true)
    const { user, token } = await api.login(email || 'you@example.com', name)
    setSession(user, token)
    navigate('/home')
  }

  return (
    <div className="auth-wrap">
      <div className="auth-aside">
        <div className="brand">
          <span className="brand-logo">◆</span> Collide
        </div>
        <h2>Code together.<br />Think together.</h2>
        <p>A shared editor and an infinite notes canvas — for solo focus or live sessions with your team.</p>
      </div>

      <div className="auth-card">
        <h1>Welcome</h1>
        <p className="muted">Sign in to start a session.</p>
        <div className="field">
          <label>Name</label>
          <input value={name} placeholder="Your name" onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Email <span className="muted">(optional)</span></label>
          <input value={email} placeholder="you@example.com" onChange={(e) => setEmail(e.target.value)} />
        </div>
        <button className="btn-accent full" disabled={busy || !name.trim()} onClick={start}>
          {busy ? 'Signing in…' : 'Continue'}
        </button>
        <p className="fineprint">Mock login — no backend required yet.</p>
      </div>
    </div>
  )
}
