import { ChevronRight, Folder, FolderPlus, MoreHorizontal } from 'lucide-react'
import type { Folder as FolderType, Workspace } from '../lib/types'

interface FolderTreeProps {
  workspace: Workspace
  selectedFolderId: string | null | undefined
  expandedIds: Set<string>
  onSelect: (id: string | null | undefined) => void
  onToggle: (id: string) => void
  onAddChild: (parentId: string | null) => void
  onDelete: (folder: FolderType) => void
}

export function FolderTree({
  workspace,
  selectedFolderId,
  expandedIds,
  onSelect,
  onToggle,
  onAddChild,
  onDelete,
}: FolderTreeProps) {
  function renderFolder(folder: FolderType, depth = 0) {
    const children = workspace.folders
      .filter((candidate) => candidate.parentId === folder.id)
      .sort((a, b) => a.name.localeCompare(b.name))
    const count = workspace.notes.filter((note) => note.folderId === folder.id).length
    const expanded = expandedIds.has(folder.id)

    return (
      <div key={folder.id}>
        <div
          className={`folder-row ${selectedFolderId === folder.id ? 'selected' : ''}`}
          style={{ paddingInlineStart: `${10 + depth * 14}px` }}
        >
          <button className="tree-disclosure" onClick={() => onToggle(folder.id)} aria-label={expanded ? 'Collapse folder' : 'Expand folder'}>
            <ChevronRight size={13} className={expanded ? 'expanded' : ''} />
          </button>
          <button className="folder-select" onClick={() => onSelect(folder.id)}>
            <Folder size={15} fill="currentColor" />
            <span>{folder.name}</span>
            <small>{count || ''}</small>
          </button>
          <button className="tree-action" onClick={() => onAddChild(folder.id)} aria-label={`Add subfolder to ${folder.name}`}>
            <FolderPlus size={13} />
          </button>
          <button className="tree-action" onClick={() => onDelete(folder)} aria-label={`Delete ${folder.name}`}>
            <MoreHorizontal size={14} />
          </button>
        </div>
        {expanded && children.map((child) => renderFolder(child, depth + 1))}
      </div>
    )
  }

  const roots = workspace.folders
    .filter((folder) => folder.parentId === null)
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="folder-tree">
      <button
        className={`folder-row top-level ${selectedFolderId === undefined ? 'selected' : ''}`}
        onClick={() => onSelect(undefined)}
      >
        <span className="all-notes-icon" />
        All notes
        <small>{workspace.notes.length}</small>
      </button>
      {roots.map((folder) => renderFolder(folder))}
      <button
        className="add-folder-row"
        onClick={() => onAddChild(null)}
      >
        <FolderPlus size={14} />
        New folder
      </button>
    </div>
  )
}
