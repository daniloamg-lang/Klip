import { describe, expect, it } from 'vitest'
import type { Note, NoteRevision } from './types'
import { restoredFromRevision, withRevision } from './history'

const note: Note = {
  id: 'note',
  title: 'Current',
  content: 'Current content',
  folderId: null,
  tags: [],
  createdAt: '',
  updatedAt: '',
}

describe('note history', () => {
  it('records the pre-edit state but groups edits inside one window', () => {
    const first = withRevision(note, 1_000)
    const second = withRevision({ ...first, content: 'Changed' }, 20_000)
    expect(second.revisions).toHaveLength(1)
    expect(second.revisions?.[0].content).toBe('Current content')
  })

  it('creates another revision after the edit window', () => {
    const first = withRevision(note, 1_000)
    const second = withRevision({ ...first, content: 'Changed' }, 40_000)
    expect(second.revisions).toHaveLength(2)
    expect(second.revisions?.[1].content).toBe('Changed')
  })

  it('preserves the current state before restoring an older revision', () => {
    const revision: NoteRevision = {
      id: 'old',
      title: 'Old title',
      content: 'Old content',
      savedAt: '2026-01-01T00:00:00.000Z',
    }
    const restored = restoredFromRevision(note, revision, 1_000)
    expect(restored.title).toBe('Old title')
    expect(restored.content).toBe('Old content')
    expect(restored.revisions?.[0].title).toBe('Current')
  })
})
