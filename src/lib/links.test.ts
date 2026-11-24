import { describe, expect, it } from 'vitest'
import type { Note } from './types'
import {
  incomingNotes,
  linksFromContent,
  markdownWithWikiLinks,
  outgoingNotes,
  renameWikiLinks,
} from './links'

function note(id: string, title: string, content = ''): Note {
  return {
    id,
    title,
    content,
    folderId: null,
    tags: [],
    createdAt: '',
    updatedAt: '',
  }
}

describe('wiki links', () => {
  const alpha = note('a', 'Alpha', 'A link to [[Beta]] and [[Gamma|the third]].')
  const beta = note('b', 'Beta', 'Back to [[Alpha]].')
  const gamma = note('g', 'Gamma')

  it('extracts targets and labels', () => {
    expect(linksFromContent(alpha.content)).toEqual([
      { targetTitle: 'Beta', label: 'Beta' },
      { targetTitle: 'Gamma', label: 'the third' },
    ])
  })

  it('finds outgoing and incoming notes once by id', () => {
    expect(outgoingNotes(alpha, [alpha, beta, gamma])).toEqual([beta, gamma])
    expect(incomingNotes(alpha, [alpha, beta, gamma])).toEqual([beta])
  })

  it('rewrites wiki targets without changing display aliases', () => {
    expect(renameWikiLinks('See [[Old]], then [[Old|the original]].', 'Old', 'New')).toBe(
      'See [[New]], then [[New|the original]].',
    )
  })

  it('renders links as addressable markdown anchors', () => {
    expect(markdownWithWikiLinks('Read [[Design Notes|the notes]].')).toBe(
      'Read [the notes](#note=Design%20Notes).',
    )
  })

  it('supports semicolon page links and URL links', () => {
    const content = 'Open ;;Beta;; or ::Wikipedia::(https://wikipedia.org).'
    expect(linksFromContent(content)).toContainEqual({ targetTitle: 'Beta', label: 'Beta' })
    expect(markdownWithWikiLinks(content)).toBe(
      'Open [Beta](#note=Beta) or [Wikipedia](https://wikipedia.org).',
    )
  })

  it('renames semicolon page links while preserving aliases', () => {
    expect(renameWikiLinks('See ;;the notes|Old;;.', 'Old', 'New')).toBe(
      'See ;;the notes|New;;.',
    )
  })
})
