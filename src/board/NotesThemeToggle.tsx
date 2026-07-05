import { useState } from 'react'
import { useEditor } from 'tldraw'

export const THEME_KEY = 'collide-notes-theme'
type NoteTheme = 'light' | 'dark'

/**
 * Notes light/dark toggle. Rendered into tldraw's top-right SharePanel slot so
 * tldraw's layout stacks it cleanly ABOVE the style panel (right-aligned column)
 * instead of overlapping our old absolutely-positioned button. Drives tldraw's
 * colorScheme directly and persists the choice.
 */
export function NotesThemeToggle() {
  const editor = useEditor()
  const [theme, setTheme] = useState<NoteTheme>(
    () => (localStorage.getItem(THEME_KEY) as NoteTheme) || 'light',
  )

  function toggle() {
    setTheme((t) => {
      const next: NoteTheme = t === 'light' ? 'dark' : 'light'
      localStorage.setItem(THEME_KEY, next)
      editor.user.updateUserPreferences({ colorScheme: next })
      return next
    })
  }

  const label = theme === 'light' ? 'Switch notes to dark' : 'Switch notes to light'
  return (
    <button className="collide-notes-theme" onClick={toggle} title={label} aria-label={label}>
      {theme === 'light' ? '🌙' : '☀️'}
    </button>
  )
}
