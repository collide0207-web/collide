import { useState } from 'react'
import { DefaultToolbar } from 'tldraw'

const COLLAPSED_KEY = 'collide-toolbar-collapsed'

/**
 * Wraps tldraw's default toolbar with a small handle that minimizes/maximizes
 * the tool selection row. Collapsed state persists across reloads.
 */
export function CollapsibleToolbar() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_KEY) === '1')

  function toggle() {
    setCollapsed((c) => {
      const next = !c
      localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0')
      return next
    })
  }

  return (
    <div className="collide-toolbar-shell">
      <button
        className="collide-toolbar-toggle"
        data-collapsed={collapsed}
        onClick={toggle}
        title={collapsed ? 'Show tools' : 'Hide tools'}
        aria-label={collapsed ? 'Show tools' : 'Hide tools'}
        aria-expanded={!collapsed}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path
            d="M2.5 4.5L6 8L9.5 4.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <div className="collide-toolbar-track" data-collapsed={collapsed}>
        <div className="collide-toolbar-clip">
          <DefaultToolbar />
        </div>
      </div>
    </div>
  )
}
