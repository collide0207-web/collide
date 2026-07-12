import { memo } from 'react'
import type { ViewerCapabilities, ViewerControls } from './core/types'
import type { ViewerControlActions } from './core/useViewerControls'
import { Dropzone, type AcceptedFile } from './upload/Dropzone'

interface Props {
  controls: ViewerControls
  actions: ViewerControlActions
  capabilities: ViewerCapabilities
  fileName: string
  onUpload: (accepted: AcceptedFile) => void
}

/**
 * The single document toolbar. Buttons enable/disable purely from the active
 * viewer's {@link ViewerCapabilities}, so there is no per-file-type branching
 * here and new document types work without touching this component.
 */
function ToolbarImpl({ controls, actions, capabilities, fileName, onUpload }: Props) {
  const { page, pageCount, zoom, fit } = controls
  return (
    <div className="doc-toolbar">
      <Dropzone compact onAccept={onUpload} />

      <span className="doc-toolbar__file" title={fileName}>
        {fileName}
      </span>

      <span className="doc-toolbar__sep" />

      <button
        className="doc-tool"
        onClick={actions.prev}
        disabled={!capabilities.paging || page <= 1}
        title="Previous (↑)"
      >
        ‹
      </button>
      {capabilities.paging && (
        <span className="doc-toolbar__page">
          {pageCount ? `${page} / ${pageCount}` : '–'}
        </span>
      )}
      <button
        className="doc-tool"
        onClick={actions.next}
        disabled={!capabilities.paging || page >= pageCount}
        title="Next (↓)"
      >
        ›
      </button>

      <span className="doc-toolbar__sep" />

      <button className="doc-tool" onClick={actions.zoomOut} disabled={!capabilities.zoom} title="Zoom out (Ctrl −)">
        −
      </button>
      <span className="doc-toolbar__zoom">{Math.round((fit ? 1 : zoom) * 100)}%</span>
      <button className="doc-tool" onClick={actions.zoomIn} disabled={!capabilities.zoom} title="Zoom in (Ctrl +)">
        +
      </button>

      <span className="doc-toolbar__sep" />

      <button className="doc-tool" onClick={actions.rotateLeft} disabled={!capabilities.rotate} title="Rotate left">
        ↺
      </button>
      <button className="doc-tool" onClick={actions.rotateRight} disabled={!capabilities.rotate} title="Rotate right">
        ↻
      </button>

      <span className="doc-toolbar__sep" />

      {capabilities.fitWidth && (
        <button
          className={`doc-tool doc-tool--text${fit === 'width' ? ' is-active' : ''}`}
          onClick={actions.fitWidth}
          title="Fit width"
        >
          Fit width
        </button>
      )}
      {capabilities.fitPage && (
        <button
          className={`doc-tool doc-tool--text${fit === 'page' ? ' is-active' : ''}`}
          onClick={actions.fitPage}
          title={capabilities.paging ? 'Fit page' : 'Fit screen'}
        >
          {capabilities.paging && capabilities.fitWidth ? 'Fit page' : 'Fit screen'}
        </button>
      )}
    </div>
  )
}

export const Toolbar = memo(ToolbarImpl)
