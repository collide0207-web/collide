/**
 * `pptx-preview` ships type definitions in dist/ but no `types` entry in its
 * package.json, so TypeScript can't auto-resolve them. Declare the slice of the
 * API we use here.
 */
declare module 'pptx-preview' {
  export interface PreviewerOptions {
    renderer?: string
    width?: number
    height?: number
    mode?: 'list' | 'slide'
  }

  export interface PPTXPreviewer {
    readonly slideCount: number
    currentIndex: number
    preview(file: ArrayBuffer): Promise<unknown>
    renderSingleSlide(slideIndex: number): void
    renderNextSlide(): void
    renderPreSlide(): void
    destroy(): void
  }

  export function init(dom: HTMLElement, options: PreviewerOptions): PPTXPreviewer
}
