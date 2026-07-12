import type { DocumentKind } from './types'

/**
 * File-type detection for uploads.
 *
 * We match on both MIME type and extension because browsers are inconsistent
 * about the MIME they attach to `.pptx` (often the generic
 * `application/octet-stream`) and to `.svg`/`.webp` on some platforms.
 */

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg']
const PPTX_EXT = ['ppt', 'pptx']
const PDF_EXT = ['pdf']

/** Human-readable list of accepted types, for the dropzone hint + error copy. */
export const ACCEPTED_LABEL = 'PDF, images (PNG/JPG/WEBP/GIF/SVG) or PowerPoint (PPT/PPTX)'

/** `accept` attribute value for the hidden file input. */
export const ACCEPT_ATTR = [
  'application/pdf',
  'image/*',
  '.ppt',
  '.pptx',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
].join(',')

export const MAX_FILE_BYTES = 100 * 1024 * 1024 // 100 MB

export function getExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

/**
 * Resolve a file to a {@link DocumentKind}, or `null` when unsupported.
 * Extension takes priority; MIME is a fallback for extension-less files.
 */
export function detectKind(file: File): DocumentKind | null {
  const ext = getExtension(file.name)
  const mime = file.type.toLowerCase()

  if (PDF_EXT.includes(ext) || mime === 'application/pdf') return 'pdf'
  if (IMAGE_EXT.includes(ext) || mime.startsWith('image/')) return 'image'
  if (PPTX_EXT.includes(ext) || mime.includes('presentationml') || mime === 'application/vnd.ms-powerpoint')
    return 'pptx'

  return null
}

export type ValidationError =
  | { kind: 'unsupported'; message: string }
  | { kind: 'too-large'; message: string }
  | { kind: 'empty'; message: string }

export interface ValidationResult {
  ok: boolean
  documentKind: DocumentKind | null
  error: ValidationError | null
}

/** Validate a single file: size, emptiness, and supported type. */
export function validateFile(file: File): ValidationResult {
  if (file.size === 0) {
    return { ok: false, documentKind: null, error: { kind: 'empty', message: `"${file.name}" is empty.` } }
  }
  if (file.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      documentKind: null,
      error: { kind: 'too-large', message: `"${file.name}" is ${formatBytes(file.size)} — the limit is 100 MB.` },
    }
  }
  const documentKind = detectKind(file)
  if (!documentKind) {
    return {
      ok: false,
      documentKind: null,
      error: { kind: 'unsupported', message: `"${file.name}" is not a supported file. Upload ${ACCEPTED_LABEL}.` },
    }
  }
  return { ok: true, documentKind, error: null }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`
}
