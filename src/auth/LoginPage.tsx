import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useSession } from '../store/session'

export function LoginPage() {
  const navigate = useNavigate()
  const setSession = useSession((s) => s.setSession)
  const [name, setName] = useState('You')
  const [email, setEmail] = useState('you@example.com')
  const [busy, setBusy] = useState(false)

  async function start() {
    setBusy(true)
    const { user, token } = await api.login(email, name)
    setSession(user, token)
    const room = await api.createRoom('My First Room')
    navigate(`/room/${room.id}`)
  }

  return (
    <div className="login">
      <div className="login-card">
        <h1>Collide</h1>
        <p>Mock login — frontend-first scaffold. No backend required yet.</p>
        <div className="field">
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <button disabled={busy} onClick={start}>
          {busy ? 'Starting…' : 'Sign in & create a room'}
        </button>
      </div>
    </div>
  )
}
