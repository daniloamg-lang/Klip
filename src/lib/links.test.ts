import { describe, expect, it } from 'vitest'
import type { Note } from './types'
import {
  incomingNotes,
  linksFromContent,
  markdownWithWikiLinks,
  outgoingNotes,
  renderedLinkSourceRange,
  replaceRenderedLinkLabel,
  renderedLinkLabelRange,
  renameWikiLinks,
  selectedLinkRange,
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

  it('supports trailing page links and URL links without exposing URL text', () => {
    const content = 'Open Beta;; or Wikipedia::(https://wikipedia.org).'
    expect(linksFromContent(content)).toContainEqual({ targetTitle: 'Beta', label: 'Beta' })
    expect(markdownWithWikiLinks(content)).toBe(
      'Open [Beta](#note=Beta) or [Wikipedia](https://wikipedia.org).',
    )
  })

  it('renames trailing page links while preserving aliases', () => {
    expect(renameWikiLinks('See "the notes";;(Old).', 'Old', 'New')).toBe(
      'See "the notes";;(New).',
    )
  })

  it('keeps legacy link syntax working', () => {
    expect(markdownWithWikiLinks('Open ;;Beta;; and ::Wikipedia::(https://wikipedia.org).')).toBe(
      'Open [Beta](#note=Beta) and [Wikipedia](https://wikipedia.org).',
    )
  })

  it('locates the editable label inside a rendered smart link', () => {
    const content = 'Read Wikipedia::(https://wikipedia.org).'
    expect(renderedLinkLabelRange(content, 'url', 'Wikipedia', 'https://wikipedia.org')).toEqual({
      labelStart: 5,
      labelEnd: 14,
    })
  })

  it('deletes the whole link when its selected label is removed', () => {
    const token = 'Wikipedia::(https://wikipedia.org)'
    const content = `Read ${token}.`
    const start = content.indexOf('Wikipedia')
    expect(selectedLinkRange(content, start, start + 'Wikipedia'.length)).toEqual({
      start: 5,
      end: 5 + token.length,
    })
  })

  it('edits a rendered label without exposing or changing its URL', () => {
    expect(replaceRenderedLinkLabel(
      'Read Wikipedia::(https://wikipedia.org).',
      'url',
      'Wikipedia',
      'https://wikipedia.org',
      'Encyclopedia',
    )).toBe('Read Encyclopedia::(https://wikipedia.org).')
  })

  it('removes a smart link when its label is cleared', () => {
    expect(replaceRenderedLinkLabel(
      'Read Wikipedia::(https://wikipedia.org).',
      'url',
      'Wikipedia',
      'https://wikipedia.org',
      '',
    )).toBe('Read .')
  })

  it('finds the end of stored link syntax for continued writing', () => {
    const token = 'Wikipedia::(https://wikipedia.org)'
    expect(renderedLinkSourceRange(
      `Read ${token}.`,
      'url',
      'Wikipedia',
      'https://wikipedia.org',
    )).toEqual({ start: 5, end: 5 + token.length })
  })
})
