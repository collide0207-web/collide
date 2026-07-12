import { memo, useCallback, useRef, useState } from 'react'
import { ACCEPT_ATTR, ACCEPTED_LABEL, formatBytes, validateFile } from '../core/fileType'
import type { DocumentKind } from '../core/types'

export interface AcceptedFile {
  file: File
  kind: DocumentKind
}

interface Props {
  onAccept: (accepted: AcceptedFile) => void
  /** Compact variant for the toolbar "Upload" button flow (no big drop area). */
  compact?: boolean
}

/**
 * Drag-and-drop + browse upload with client-side validation.
 *
 * Reads the file locally (no network), so "progress" reflects the browser
 * reading the blob into memory for large files — giving the user feedback while
 * a 100 MB file is prepared. Invalid-file and unsupported-type errors are shown
 * distinctly.
 */
function DropzoneImpl({ onAccept, compact = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<number | null>(null)

  const handleFiles = useCallback(
    (files: FileList | null) => {
      setError(null)
      const file = files?.[0]
      if (!file) return

      const result = validateFile(file)
      if (!result.ok || !result.documentKind) {
        setError(result.error?.message ?? 'That file could not be used.')
        return
      }

      // Stream the file through a FileReader purely to surface progress for
      // large uploads; the object URL itself is created by the caller.
      const reader = new FileReader()
      setProgress(0)
      reader.onprogress = (e) => {
        if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100))
      }
      reader.onerror = () => {
        setProgress(null)
        setError(`"${file.name}" could not be read. It may be corrupted.`)
      }
      reader.onload = () => {
        setProgress(null)
        onAccept({ file, kind: result.documentKind! })
      }
      reader.readAsArrayBuffer(file)
    },
    [onAccept],
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      handleFiles(e.dataTransfer.files)
    },
    [handleFiles],
  )

  const openPicker = () => inputRef.current?.click()

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept={ACCEPT_ATTR}
      hidden
      onChange={(e) => {
        handleFiles(e.target.files)
        e.target.value = '' // allow re-selecting the same file
      }}
    />
  )

  if (compact) {
    return (
      <>
        {input}
        <button className="btn-ghost" onClick={openPicker} title="Upload a document">
          ⬆ Upload
        </button>
      </>
    )
  }

  return (
    <div className="dropzone-wrap">
      <div
        className={`dropzone${dragging ? ' dropzone--active' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={openPicker}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && openPicker()}
      >
        {input}
        <div className="dropzone__icon">📄</div>
        <p className="dropzone__title">Drag &amp; drop a document here</p>
        <p className="dropzone__hint">
          or <span className="dropzone__link">browse files</span>
        </p>
        <p className="dropzone__types">{ACCEPTED_LABEL} · up to 100 MB</p>

        {progress !== null && (
          <div className="dropzone__progress" aria-label="Upload progress">
            <div className="dropzone__progress-bar" style={{ width: `${progress}%` }} />
            <span className="dropzone__progress-label">{progress}%</span>
          </div>
        )}
      </div>

      {error && (
        <p className="dropzone__error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export const Dropzone = memo(DropzoneImpl)
export { formatBytes }
