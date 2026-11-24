export interface NoteRevision {
  id: string
  title: string
  content: string
  savedAt: string
}

export interface Note {
  id: string
  title: string
  content: string
  folderId: string | null
  tags: string[]
  createdAt: string
  updatedAt: string
  revisions?: NoteRevision[]
}

export interface Folder {
  id: string
  name: string
  parentId: string | null
  createdAt: string
}

export interface Workspace {
  formatVersion: 1
  folders: Folder[]
  notes: Note[]
}

export interface VaultRecord {
  id: 'local'
  salt: string
  iv: string
  ciphertext: string
  updatedAt: string
  recovery?: RecoveryBundle
}

export interface CloudSnapshot {
  user_id: string
  revision: number
  key_salt: string
  payload: unknown
  updated_at: string
}

export interface EncryptedWorkspaceEnvelope {
  formatVersion: 1
  iv: string
  ciphertext: string
  recovery?: RecoveryBundle
}

export interface RecoveryBundle {
  formatVersion: 1
  salt: string
  iv: string
  ciphertext: string
}

export interface NoteLink {
  targetTitle: string
  label: string
}

export const emptyWorkspace = (): Workspace => ({
  formatVersion: 1,
  folders: [],
  notes: [],
})

export const makeId = () => crypto.randomUUID()

export function createFolder(name: string, parentId: string | null = null): Folder {
  return {
    id: makeId(),
    name,
    parentId,
    createdAt: new Date().toISOString(),
  }
}

export function createNote(folderId: string | null = null, title = 'Untitled note'): Note {
  const now = new Date().toISOString()
  return {
    id: makeId(),
    title,
    content: '',
    folderId,
    tags: [],
    createdAt: now,
    updatedAt: now,
  }
}
