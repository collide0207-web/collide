/**
 * Shared contracts for the Document Workspace viewers.
 *
 * Every viewer (PDF / image / PPTX) is driven by the same {@link ViewerControls}
 * state and reports back through {@link ViewerHandle}. Keeping one contract here
 * means the toolbar, the panel, and future viewers never duplicate control logic
 * and a new document type only has to implement this interface.
 */

/** The document kinds the workspace can detect and render. */
export type DocumentKind = 'pdf' | 'image' | 'pptx'

/** A file the user has uploaded, resolved to an object URL for the viewers. */
export interface DocumentSource {
  file: File
  /** Object URL created from `file`; revoked when the source is replaced. */
  url: string
  kind: DocumentKind
  name: string
  size: number
}

/**
 * Toolbar-driven view state shared by every viewer. Viewers read this and render
 * accordingly; they never own zoom/rotation/page themselves, so behaviour stays
 * identical across document types.
 */
export interface ViewerControls {
  /** 1-based current page / slide. */
  page: number
  /** Total pages / slides, or 0 until the document reports it. */
  pageCount: number
  /** Zoom multiplier (1 = 100%). */
  zoom: number
  /** Rotation in degrees, always normalised to 0 | 90 | 180 | 270. */
  rotation: number
  /** Which fit mode is active, if any. */
  fit: 'width' | 'page' | null
}

/**
 * What a viewer exposes back to the panel/toolbar. `capabilities` lets the
 * toolbar enable only the buttons a given viewer supports, with no per-type
 * branching in the toolbar itself.
 */
export interface ViewerCapabilities {
  paging: boolean
  zoom: boolean
  rotate: boolean
  fitWidth: boolean
  fitPage: boolean
}

/** Props every viewer receives. Implement this to add a new document type. */
export interface ViewerProps {
  source: DocumentSource
  controls: ViewerControls
  /** Merge a partial update into the shared control state. */
  onControlsChange: (patch: Partial<ViewerControls>) => void
  /** Report the document's total page/slide count once known. */
  onPageCount: (count: number) => void
}

export const DEFAULT_CONTROLS: ViewerControls = {
  page: 1,
  pageCount: 0,
  zoom: 1,
  rotation: 0,
  fit: null,
}

export const ZOOM_MIN = 0.25
export const ZOOM_MAX = 5
export const ZOOM_STEP = 0.25
