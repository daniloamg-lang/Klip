import type { Note, NoteLink } from './types'

const wikiLinkPattern = /\[\[([^\]|\n]+)(?:\|([^\]]+))?\]\]/g
const legacyPageLinkPattern = /;;([^;|\n]+)(?:\|([^;\n]+))?;;/g
const pageLinkPattern = /"([^"\n]+)";;\(([^)\n]+)\)|([^\s;\n]+);;(?:\(([^)\n]+)\))?/g
const legacyUrlLinkPattern = /::([^:\n]+)::\(([^)\n]+)\)/g
const urlLinkPattern = /"([^"\n]+)"::\(([^)\n]+)\)|([^\s:\n]+)::\(([^)\n]+)\)/g

export function linksFromContent(content: string): NoteLink[] {
  const links: NoteLink[] = []
  for (const match of content.matchAll(new RegExp(wikiLinkPattern))) {
    links.push({ targetTitle: match[1].trim(), label: (match[2] ?? match[1]).trim() })
  }
  for (const match of content.matchAll(new RegExp(legacyPageLinkPattern))) {
    links.push({ targetTitle: (match[2] ?? match[1]).trim(), label: match[1].trim() })
  }
  for (const match of content.matchAll(new RegExp(pageLinkPattern))) {
    const label = (match[1] ?? match[3]).trim()
    links.push({ targetTitle: (match[2] ?? match[4] ?? label).trim(), label })
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
  const withPageLinks = content.replace(
    legacyPageLinkPattern,
    (_match, rawLabel: string, rawTarget: string | undefined) => {
      const label = rawLabel.trim()
      const target = (rawTarget ?? rawLabel).trim()
      return `[${escapeLabel(label)}](#note=${encodeURIComponent(target)})`
    },
  ).replace(
    pageLinkPattern,
    (_match, quotedLabel: string | undefined, quotedTarget: string | undefined, word: string | undefined, wordTarget: string | undefined) => {
      const label = (quotedLabel ?? word ?? '').trim()
      const target = (quotedTarget ?? wordTarget ?? label).trim()
      return `[${escapeLabel(label)}](#note=${encodeURIComponent(target)})`
    },
  ).replace(
    new RegExp(wikiLinkPattern),
    (_match, rawTarget: string, rawLabel: string | undefined) => {
      const target = rawTarget.trim()
      const label = (rawLabel ?? rawTarget).trim()
      return `[${escapeLabel(label)}](#note=${encodeURIComponent(target)})`
    },
  )
  return withPageLinks.replace(
    legacyUrlLinkPattern,
    (_match, rawLabel: string, rawUrl: string) =>
      `[${escapeLabel(rawLabel.trim())}](${sanitizeUrlForMarkdown(rawUrl)})`,
  ).replace(
    urlLinkPattern,
    (_match, quotedLabel: string | undefined, quotedUrl: string | undefined, word: string | undefined, wordUrl: string | undefined) =>
      `[${escapeLabel((quotedLabel ?? word ?? '').trim())}](${sanitizeUrlForMarkdown(quotedUrl ?? wordUrl ?? '')})`,
  )
}

export function renameWikiLinks(content: string, oldTitle: string, newTitle: string): string {
  const oldNormalized = oldTitle.trim().toLocaleLowerCase()
  const renamedWikiLinks = content.replace(
    new RegExp(wikiLinkPattern),
    (match, rawTarget: string, rawLabel?: string) => {
      if (rawTarget.trim().toLocaleLowerCase() !== oldNormalized) return match
      return rawLabel === undefined ? `[[${newTitle}]]` : `[[${newTitle}|${rawLabel}]]`
    },
  )
  return renamedWikiLinks.replace(
    legacyPageLinkPattern,
    (match, rawLabel: string, rawTarget?: string) => {
      const target = (rawTarget ?? rawLabel).trim()
      if (target.toLocaleLowerCase() !== oldNormalized) return match
      return `;;${rawLabel.trim()}|${newTitle};;`
    },
  ).replace(
    pageLinkPattern,
    (match, quotedLabel?: string, quotedTarget?: string, word?: string, wordTarget?: string) => {
      const label = (quotedLabel ?? word ?? '').trim()
      const target = (quotedTarget ?? wordTarget ?? label).trim()
      if (target.toLocaleLowerCase() !== oldNormalized) return match
      return toPageSyntax(label, newTitle)
    },
  )
}

function escapeLabel(label: string): string {
  return label.replaceAll('\\', '\\\\').replaceAll('[', '\\[').replaceAll(']', '\\]')
}

function sanitizeUrlForMarkdown(url: string): string {
  return url.trim().replaceAll(')', '%29')
}

export function toPageSyntax(label: string, target = label): string {
  const cleanLabel = label.trim()
  const cleanTarget = target.trim()
  if (!cleanLabel.includes(' ') && cleanTarget === cleanLabel) return `${cleanLabel};;`
  if (!cleanLabel.includes(' ')) return `${cleanLabel};;(${cleanTarget})`
  return `"${cleanLabel}";;(${cleanTarget})`
}

export function toUrlSyntax(label: string, url: string): string {
  const cleanLabel = label.trim()
  return cleanLabel.includes(' ')
    ? `"${cleanLabel}"::(${url.trim()})`
    : `${cleanLabel}::(${url.trim()})`
}
