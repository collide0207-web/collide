import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useSession } from '../store/session'

type Mode = 'signin' | 'signup'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined

/** Load the Google Identity Services script once; resolve when window.google is ready. */
function loadGoogleScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as unknown as { google?: unknown }).google) return resolve()
    const existing = document.getElementById('gis-script')
    if (existing) {
      existing.addEventListener('load', () => resolve())
      return
    }
    const s = document.createElement('script')
    s.id = 'gis-script'
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('failed to load Google sign-in'))
    document.head.appendChild(s)
  })
}

export function LoginPage() {
  const navigate = useNavigate()
  const setSession = useSession((s) => s.setSession)

  const [mode, setMode] = useState<Mode>('signin')
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const googleBtn = useRef<HTMLDivElement>(null)

  async function submit() {
    setError(null)
    setBusy(true)
    try {
      const result =
        mode === 'signup'
          ? await api.signup({ email, username, name, password })
          : await api.login(email, password)
      setSession(result.user, {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
      })
      navigate('/home')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'something went wrong')
    } finally {
      setBusy(false)
    }
  }

  // Wire the "Continue with Google" button when a client id is configured.
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return
    let cancelled = false
    loadGoogleScript()
      .then(() => {
        if (cancelled || !googleBtn.current) return
        const google = (window as unknown as { google: any }).google
        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async (resp: { credential: string }) => {
            setError(null)
            setBusy(true)
            try {
              const result = await api.loginWithGoogle(resp.credential)
              setSession(result.user, {
                accessToken: result.accessToken,
                refreshToken: result.refreshToken,
                expiresIn: result.expiresIn,
              })
              navigate('/home')
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Google sign-in failed')
            } finally {
              setBusy(false)
            }
          },
        })
        google.accounts.id.renderButton(googleBtn.current, {
          theme: 'outline',
          size: 'large',
          width: 320,
        })
      })
      .catch(() => setError('could not load Google sign-in'))
    return () => {
      cancelled = true
    }
  }, [navigate, setSession])

  const canSubmit =
    mode === 'signup'
      ? name.trim() && username.trim() && email.trim() && password
      : email.trim() && password

  return (
    <div className="auth-wrap">
      <div className="auth-aside">
        <div className="brand">
          <span className="brand-logo">◆</span> Collide
        </div>
        <h2>
          Code together.
          <br />
          Think together.
        </h2>
        <p>
          A shared editor and an infinite notes canvas — for solo focus or live sessions with your
          team.
        </p>
      </div>

      <div className="auth-card">
        <h1>{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h1>
        <p className="muted">
          {mode === 'signup' ? 'Sign up to start collaborating.' : 'Sign in to continue.'}
        </p>

        {mode === 'signup' && (
          <>
            <div className="field">
              <label>Name</label>
              <input value={name} placeholder="Your name" onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label>Username</label>
              <input
                value={username}
                placeholder="username"
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          </>
        )}

        <div className="field">
          <label>Email</label>
          <input
            type="email"
            value={email}
            placeholder="you@example.com"
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            type="password"
            value={password}
            placeholder={mode === 'signup' ? 'At least 8 chars, mixed case, digit, symbol' : 'Your password'}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && canSubmit && submit()}
          />
        </div>

        {error && <p className="auth-error">{error}</p>}

        <button className="btn-accent full" disabled={busy || !canSubmit} onClick={submit}>
          {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
        </button>

        {GOOGLE_CLIENT_ID && (
          <>
            <div className="auth-divider">or</div>
            <div ref={googleBtn} className="google-btn" />
          </>
        )}

        <p className="fineprint">
          {mode === 'signup' ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            type="button"
            className="linklike"
            onClick={() => {
              setError(null)
              setMode(mode === 'signup' ? 'signin' : 'signup')
            }}
          >
            {mode === 'signup' ? 'Sign in' : 'Sign up'}
          </button>
        </p>
      </div>
    </div>
  )
}
