import { useState } from 'react'
import { DefaultStylePanel, useRelevantStyles, type TLUiStylePanelProps } from 'tldraw'

const COLLAPSED_KEY = 'collide-style-collapsed'

/**
 * Wraps tldraw's top-right style panel (color / opacity / fill / dash / size) with
 * a header + collapse control, mirroring the minimize handle on the tools toolbar.
 * Collapsed → a small floating palette button to reopen. State persists across reloads.
 *
 * Notes:
 * - We gate on useRelevantStyles(): when nothing is selected / no styleable tool is
 *   active, tldraw's panel content is empty, so we render nothing (no stray header).
 * - tldraw reuses this same component inside its MOBILE popover (isMobile). There it's
 *   already an on-demand panel, so we pass through without adding our own chrome.
 */
export function CollapsibleStylePanel(props: TLUiStylePanelProps) {
  const styles = useRelevantStyles()
  // Default to COLLAPSED so the canvas corner stays clean — the colors/size panel
  // is tucked into a small palette button and only opens when the user asks for it.
  // Once the user toggles it, their choice is remembered ('0' = keep it open).
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_KEY) !== '0')

  function toggle() {
    setCollapsed((c) => {
      const next = !c
      localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0')
      return next
    })
  }

  // Mobile: tldraw already shows this on-demand from a toolbar button — no chrome.
  if (props.isMobile) return <DefaultStylePanel {...props} />

  // Nothing to style → show nothing (matches tldraw's own behaviour).
  if (!styles) return null

  if (collapsed) {
    return (
      <button
        className="collide-style-reopen"
        onClick={toggle}
        title="Show style options"
        aria-label="Show style options"
        aria-expanded={false}
      >
        <PaletteIcon />
      </button>
    )
  }

  return (
    <div className="collide-style-shell">
      <div className="collide-style-head">
        <span className="collide-style-title">Style</span>
        <button
          className="collide-style-btn"
          onClick={toggle}
          title="Hide style options"
          aria-label="Hide style options"
          aria-expanded={true}
        >
          <CloseIcon />
        </button>
      </div>
      <DefaultStylePanel {...props} />
    </div>
  )
}

function PaletteIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M10 2.5a7.5 7.5 0 0 0 0 15c.9 0 1.5-.7 1.5-1.5 0-.4-.15-.75-.4-1-.24-.26-.39-.6-.39-1 0-.83.67-1.5 1.5-1.5H14a3.5 3.5 0 0 0 3.5-3.5C17.5 5.36 14.14 2.5 10 2.5z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <circle cx="6.6" cy="8.4" r="1" fill="currentColor" />
      <circle cx="10" cy="6.4" r="1" fill="currentColor" />
      <circle cx="13.4" cy="8.4" r="1" fill="currentColor" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
