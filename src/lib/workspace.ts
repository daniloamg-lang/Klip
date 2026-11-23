import type { Workspace } from './types'

export function sortedFolders(workspace: Workspace) {
  return [...workspace.folders].sort((a, b) => a.name.localeCompare(b.name))
}

export function sortedNotes(workspace: Workspace, folderId?: string | null) {
  return [...workspace.notes]
    .filter((note) => folderId === undefined || note.folderId === folderId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function uniqueTitle(baseTitle: string, titles: string[]): string {
  const existing = new Set(titles.map((title) => title.trim().toLocaleLowerCase()))
  if (!existing.has(baseTitle.trim().toLocaleLowerCase())) return baseTitle
  let number = 2
  while (existing.has(`${baseTitle} ${number}`.toLocaleLowerCase())) number += 1
  return `${baseTitle} ${number}`
}
