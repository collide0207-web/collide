import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useSession, type StudyMode } from '../store/session'
import { InterviewSetup } from './InterviewSetup'
import { setInterviewQuestions, type Question } from '../collab/interview'

export function ModeSelect() {
  const navigate = useNavigate()
  const user = useSession((s) => s.user)
  const setMode = useSession((s) => s.setMode)
  const logout = useSession((s) => s.logout)
  const [showSetup, setShowSetup] = useState(false)

  if (!user) {
    navigate('/login')
    return null
  }

  const roomName: Record<StudyMode, string> = {
    solo: 'Solo session',
    group: 'Group session',
    interview: 'Interview session',
  }

  async function enter(mode: StudyMode, questions?: Question[]) {
    setMode(mode)
    const room = await api.createRoom(roomName[mode])
    // Seed the interviewer's questions into the room's shared doc before entering,
    // so the candidate sees them the moment they join.
    if (mode === 'interview' && questions && questions.length) {
      setInterviewQuestions(room.id, questions)
    }
    navigate(`/room/${room.id}?mode=${mode}`)
  }

  return (
    <div className="mode-wrap">
      <div className="mode-topbar">
        <div className="brand"><span className="brand-logo">◆</span> Collide</div>
        <div className="spacer" />
        <span className="hello">Hi, {user.name}</span>
        <button className="btn-ghost" onClick={() => { logout(); navigate('/login') }}>Log out</button>
      </div>

      <div className="mode-body">
        <h1>How do you want to work today?</h1>
        <p className="muted">You can switch anytime by starting a new session.</p>

        <div className="modes">
          <button className="mode-card" onClick={() => enter('solo')}>
            <div className="mode-icon">🎧</div>
            <h3>Self study</h3>
            <p>Just you, the code editor and your notes. No calls, no distractions.</p>
            <span className="mode-cta">Start solo →</span>
          </button>

          <button className="mode-card group" onClick={() => enter('group')}>
            <div className="mode-icon">👥</div>
            <h3>Group study</h3>
            <p>Start a live call with video, screen share and shared editing for multiple people.</p>
            <span className="mode-cta">Start a room →</span>
          </button>

          <button className="mode-card interview" onClick={() => setShowSetup(true)}>
            <div className="mode-icon">🎯</div>
            <h3>Interview</h3>
            <p>Set up coding questions with runnable test cases, then interview live over video.</p>
            <span className="mode-cta">Set up interview →</span>
          </button>
        </div>
      </div>

      {showSetup && (
        <InterviewSetup
          onCancel={() => setShowSetup(false)}
          onStart={(questions) => enter('interview', questions)}
        />
      )}
    </div>
  )
}
