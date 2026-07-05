/**
 * File & folder icons for the explorer — dependency-free inline SVG so it works
 * offline and inside any CSP. Colors approximate the VS Code "Seti" icon theme
 * (a document glyph tinted per language). Not pixel-identical, but consistent and
 * recognisable at a glance, which is the point.
 */
import { memo } from 'react'

/** extension → accent color (Seti-ish). */
const EXT_COLOR: Record<string, string> = {
  js: '#cbcb41', mjs: '#cbcb41', cjs: '#cbcb41',
  jsx: '#4fc1e9',
  ts: '#4a90d9', tsx: '#4fc1e9',
  json: '#cbcb41', jsonc: '#cbcb41',
  html: '#e37933', htm: '#e37933',
  css: '#4a90d9', scss: '#cd6799', sass: '#cd6799', less: '#4a90d9',
  md: '#519aba', markdown: '#519aba', mdx: '#519aba',
  py: '#ffca28',
  java: '#f8981d', class: '#f8981d', kt: '#f8981d',
  c: '#4a90d9', h: '#a074c4', cpp: '#4a90d9', cc: '#4a90d9', hpp: '#a074c4', cs: '#68217a',
  go: '#4fc1e9',
  rs: '#dea584',
  rb: '#cc342d',
  php: '#a074c4',
  sh: '#8ab353', bash: '#8ab353', zsh: '#8ab353',
  yml: '#cb4b16', yaml: '#cb4b16', toml: '#9c9c9c', ini: '#9c9c9c', env: '#e8bf6a',
  xml: '#e37933', svg: '#a074c4',
  sql: '#f29111', db: '#f29111',
  png: '#a074c4', jpg: '#a074c4', jpeg: '#a074c4', gif: '#a074c4', webp: '#a074c4', ico: '#a074c4', bmp: '#a074c4',
  pdf: '#e34f4f',
  zip: '#afb42b', tar: '#afb42b', gz: '#afb42b', rar: '#afb42b', '7z': '#afb42b',
  lock: '#8a93a6',
  gitignore: '#e8623c', dockerfile: '#4a90d9', dockerignore: '#4a90d9',
  vue: '#41b883', svelte: '#ff3e00',
  txt: '#8a93a6', log: '#8a93a6',
}

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'svg'])
const ARCHIVE_EXT = new Set(['zip', 'tar', 'gz', 'rar', '7z'])

function extOf(name: string): string {
  const lower = name.toLowerCase()
  if (lower.startsWith('.')) return lower.slice(1) // .gitignore, .env
  const dot = lower.lastIndexOf('.')
  return dot >= 0 ? lower.slice(dot + 1) : lower
}

/** File icon: a document glyph tinted by the file's language, plus a couple of
 *  special shapes (images, archives) so common types are distinguishable. */
export const FileIcon = memo(function FileIcon({ name }: { name: string }) {
  const ext = extOf(name)
  const color = EXT_COLOR[ext] ?? '#8a93a6'

  if (IMAGE_EXT.has(ext)) {
    return (
      <svg className="fs-ico" viewBox="0 0 16 16" width="16" height="16" aria-hidden>
        <rect x="2" y="3" width="12" height="10" rx="1.5" fill="none" stroke={color} strokeWidth="1.1" />
        <circle cx="5.5" cy="6.5" r="1.2" fill={color} />
        <path d="M3 12l3-3 2.5 2.5L11 8l2 2.5V12z" fill={color} opacity="0.85" />
      </svg>
    )
  }
  if (ARCHIVE_EXT.has(ext)) {
    return (
      <svg className="fs-ico" viewBox="0 0 16 16" width="16" height="16" aria-hidden>
        <path d="M4 2h8a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" fill="none" stroke={color} strokeWidth="1.1" />
        <rect x="7" y="3" width="2" height="1.4" fill={color} />
        <rect x="7" y="5" width="2" height="1.4" fill={color} />
        <rect x="7" y="7" width="2" height="1.8" fill={color} />
      </svg>
    )
  }

  return (
    <svg className="fs-ico" viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <path
        d="M4 1.5h5L13 5.5V14a.5.5 0 0 1-.5.5h-8A.5.5 0 0 1 4 14V2a.5.5 0 0 1 .5-.5z"
        fill={color}
        opacity="0.18"
      />
      <path
        d="M4 1.5h5L13 5.5V14a.5.5 0 0 1-.5.5h-8A.5.5 0 0 1 4 14V2a.5.5 0 0 1 .5-.5z"
        fill="none"
        stroke={color}
        strokeWidth="1"
      />
      <path d="M9 1.5V5a.5.5 0 0 0 .5.5H13" fill="none" stroke={color} strokeWidth="1" />
    </svg>
  )
})

/** Folder icon — changes between open/closed like VS Code. */
export const FolderIcon = memo(function FolderIcon({ open }: { open: boolean }) {
  const color = '#7d92c0'
  if (open) {
    return (
      <svg className="fs-ico" viewBox="0 0 16 16" width="16" height="16" aria-hidden>
        <path d="M1.5 4.5A1 1 0 0 1 2.5 3.5H6l1.3 1.3H13a1 1 0 0 1 1 1V6H4.2a1 1 0 0 0-.95.68L1.5 12z" fill={color} opacity="0.35" />
        <path d="M1.5 12l1.75-5.32A1 1 0 0 1 4.2 6H15l-1.6 5.5a1 1 0 0 1-.96.72H2.3a.8.8 0 0 1-.8-.9z" fill={color} opacity="0.8" />
      </svg>
    )
  }
  return (
    <svg className="fs-ico" viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <path d="M1.5 4.2a1 1 0 0 1 1-1H6l1.3 1.3h6.2a1 1 0 0 1 1 1v6.8a1 1 0 0 1-1 1H2.5a1 1 0 0 1-1-1z" fill={color} opacity="0.85" />
    </svg>
  )
})
