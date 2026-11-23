import { makeId, type Note, type NoteRevision } from './types'

export const maximumRevisions = 50
const revisionWindowMs = 30_000

export function withRevision(note: Note, now = Date.now()): Note {
  const revisions = note.revisions ?? []
  const latest = revisions[revisions.length - 1]
  if (latest && now - new Date(latest.savedAt).getTime() < revisionWindowMs) return note

  return {
    ...note,
    revisions: [
      ...revisions,
      {
        id: makeId(),
        title: note.title,
        content: note.content,
        savedAt: new Date(now).toISOString(),
      },
    ].slice(-maximumRevisions),
  }
}

export function restoredFromRevision(note: Note, revision: NoteRevision, now = Date.now()): Note {
  const beforeRestore = withRevision(note, now)
  return {
    ...beforeRestore,
    title: revision.title,
    content: revision.content,
    updatedAt: new Date(now).toISOString(),
  }
}
