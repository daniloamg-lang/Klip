import type { Note, NoteLink } from './types'

const wikiLinkPattern = /\[\[([^\]|\n]+)(?:\|([^\]]+))?\]\]/g

export function linksFromContent(content: string): NoteLink[] {
  const links: NoteLink[] = []
  for (const match of content.matchAll(wikiLinkPattern)) {
    links.push({ targetTitle: match[1].trim(), label: (match[2] ?? match[1]).trim() })
  }
  return links
}

export function noteByTitle(notes: Note[], title: string): Note | undefined {
  const normalized = title.trim().toLocaleLowerCase()
  return notes.find((note) => note.title.trim().toLocaleLowerCase() === normalized)
}

export function outgoingNotes(note: Note, notes: Note[]): Note[] {
  const found = linksFromContent(note.content)
    .map((link) => noteByTitle(notes, link.targetTitle))
    .filter((candidate): candidate is Note => Boolean(candidate && candidate.id !== note.id))
  return [...new Map(found.map((candidate) => [candidate.id, candidate])).values()]
}

export function incomingNotes(note: Note, notes: Note[]): Note[] {
  return notes.filter(
    (candidate) =>
      candidate.id !== note.id &&
      outgoingNotes(candidate, notes).some((linkedNote) => linkedNote.id === note.id),
  )
}

export function markdownWithWikiLinks(content: string): string {
  return content.replace(
    wikiLinkPattern,
    (_match, rawTarget: string, rawLabel: string | undefined) => {
      const target = rawTarget.trim()
      const label = (rawLabel ?? rawTarget).trim()
      return `[${label.replaceAll('[', '\\[').replaceAll(']', '\\]')}](#note=${encodeURIComponent(target)})`
    },
  )
}

export function renameWikiLinks(content: string, oldTitle: string, newTitle: string): string {
  const oldNormalized = oldTitle.trim().toLocaleLowerCase()
  return content.replace(wikiLinkPattern, (match, rawTarget: string, rawLabel?: string) => {
    if (rawTarget.trim().toLocaleLowerCase() !== oldNormalized) return match
    return rawLabel === undefined ? `[[${newTitle}]]` : `[[${newTitle}|${rawLabel}]]`
  })
}
