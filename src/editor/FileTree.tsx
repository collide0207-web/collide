import { useState } from 'react'
import { FileNode, SAMPLE_TREE } from './files'

interface Props {
  activePath: string
  onSelect: (path: string) => void
}

export function FileTree({ activePath, onSelect }: Props) {
  return (
    <div className="file-tree">
      <div className="ft-header">EXPLORER</div>
      <div className="ft-list">
        {SAMPLE_TREE.map((node) => (
          <TreeItem key={node.path} node={node} depth={0} activePath={activePath} onSelect={onSelect} />
        ))}
      </div>
    </div>
  )
}

function TreeItem({
  node,
  depth,
  activePath,
  onSelect,
}: {
  node: FileNode
  depth: number
  activePath: string
  onSelect: (path: string) => void
}) {
  const isFolder = !!node.children
  const [open, setOpen] = useState(true)
  const pad = { paddingLeft: 8 + depth * 12 }

  if (isFolder) {
    return (
      <>
        <div className="ft-item ft-folder" style={pad} onClick={() => setOpen((o) => !o)}>
          <span className="ft-caret">{open ? '▾' : '▸'}</span>
          <span className="ft-icon">📁</span>
          <span className="ft-name">{node.name}</span>
        </div>
        {open &&
          node.children!.map((child) => (
            <TreeItem key={child.path} node={child} depth={depth + 1} activePath={activePath} onSelect={onSelect} />
          ))}
      </>
    )
  }

  return (
    <div
      className={`ft-item ft-file ${activePath === node.path ? 'active' : ''}`}
      style={pad}
      onClick={() => onSelect(node.path)}
    >
      <span className="ft-icon">📄</span>
      <span className="ft-name">{node.name}</span>
    </div>
  )
}
