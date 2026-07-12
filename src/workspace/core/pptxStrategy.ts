/**
 * How a PPT/PPTX upload is turned into something renderable.
 *
 * This is the seam between the two rendering approaches:
 *  - `clientStrategy` renders in-browser (via `pptxAdapter` + PptxViewer). No
 *    backend, limited fidelity.
 *  - `backendStrategy` POSTs the file to the conversion service, gets a PDF back,
 *    and the workspace renders it with the existing PdfViewer — full fidelity,
 *    plus real zoom/rotate/paging (and future text search) for free.
 *
 * Selection is automatic: set `VITE_CONVERT_URL` and the backend path is used;
 * otherwise it falls back to the client renderer. Neither the viewers nor the
 * panel change when switching.
 */

export interface PreparedPptx {
  /** 'pdf' → render the converted PDF; 'client' → render in-browser. */
  mode: 'pdf' | 'client'
  /** Object URL of the converted PDF (mode 'pdf' only); the caller revokes it. */
  url?: string
}

export interface PptxStrategy {
  readonly id: string
  prepare(file: File): Promise<PreparedPptx>
}

const clientStrategy: PptxStrategy = {
  id: 'client',
  async prepare() {
    return { mode: 'client' }
  },
}

/** Backend PPTX→PDF conversion against the convert service at `endpoint`. */
export function backendStrategy(endpoint: string): PptxStrategy {
  const base = endpoint.replace(/\/$/, '')
  return {
    id: `backend:${base}`,
    async prepare(file) {
      const res = await fetch(`${base}/convert/pptx`, {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'X-Filename': file.name,
        },
        body: file,
      })
      if (!res.ok) {
        let message = `Couldn’t convert this presentation (error ${res.status}).`
        try {
          const body = (await res.json()) as { error?: string }
          if (body?.error) message = body.error
        } catch {
          /* non-JSON error body */
        }
        throw new Error(message)
      }
      const blob = await res.blob()
      return { mode: 'pdf', url: URL.createObjectURL(blob) }
    },
  }
}

const CONVERT_URL = (import.meta.env.VITE_CONVERT_URL as string | undefined)?.trim()
let active: PptxStrategy = CONVERT_URL ? backendStrategy(CONVERT_URL) : clientStrategy

/** Override the active strategy (e.g. to force client rendering in tests). */
export function setPptxStrategy(strategy: PptxStrategy): void {
  active = strategy
}

export function getPptxStrategy(): PptxStrategy {
  return active
}
