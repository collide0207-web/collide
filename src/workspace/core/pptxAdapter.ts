/**
 * PPTX rendering is abstracted behind a small adapter so the viewer never talks
 * to a rendering library directly.
 *
 * Today the default adapter renders client-side with `pptx-preview`. Reliable
 * in-browser PPTX rendering is inherently limited, so when a backend converter
 * becomes available you only implement a new {@link PptxAdapter} (e.g. one that
 * POSTs the file and renders the returned PDF/images) and swap it in via
 * {@link setPptxAdapter}. The `PptxViewer` component does not change.
 */

/** Live control over a mounted presentation. */
export interface PptxHandle {
  slideCount: number
  goToSlide: (index: number) => void
  destroy: () => void
}

/** Options passed when mounting. */
export interface PptxMountOptions {
  /** Render width in px; the viewer uses this to implement fit/zoom. */
  width: number
  height: number
  /** 0-based slide to show first. */
  initialSlide?: number
}

/** Contract for any PPTX rendering strategy (client or backend). */
export interface PptxAdapter {
  readonly id: string
  mount(container: HTMLElement, file: File, opts: PptxMountOptions): Promise<PptxHandle>
}

/**
 * Default: client-side rendering via `pptx-preview` (loaded lazily so it isn't
 * in the initial bundle). Fidelity is best-effort; swap this out for a backend
 * adapter for production-grade rendering.
 */
const clientPptxAdapter: PptxAdapter = {
  id: 'client:pptx-preview',
  async mount(container, file, opts) {
    const { init } = await import('pptx-preview')
    const buffer = await file.arrayBuffer()

    const previewer = init(container, {
      width: opts.width,
      height: opts.height,
      mode: 'slide',
    })
    await previewer.preview(buffer)

    const slideCount = previewer.slideCount || 1
    const initial = Math.min(Math.max(0, opts.initialSlide ?? 0), slideCount - 1)
    if (initial > 0) previewer.renderSingleSlide(initial)

    return {
      slideCount,
      goToSlide: (index: number) => {
        const clamped = Math.min(Math.max(0, index), slideCount - 1)
        previewer.renderSingleSlide(clamped)
      },
      destroy: () => {
        try {
          previewer.destroy()
        } catch {
          /* previewer may already be torn down */
        }
        container.innerHTML = ''
      },
    }
  },
}

let activeAdapter: PptxAdapter = clientPptxAdapter

/** Swap in a different PPTX rendering strategy (e.g. a backend converter). */
export function setPptxAdapter(adapter: PptxAdapter): void {
  activeAdapter = adapter
}

export function getPptxAdapter(): PptxAdapter {
  return activeAdapter
}
