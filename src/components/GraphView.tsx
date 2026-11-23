import { useMemo } from 'react'
import type { Note } from '../lib/types'
import { outgoingNotes } from '../lib/links'

interface GraphViewProps {
  notes: Note[]
  activeNoteId: string | null
  localOnly: boolean
  onOpenNote: (id: string) => void
}

interface Point {
  note: Note
  x: number
  y: number
  radius: number
}

export function GraphView({ notes, activeNoteId, localOnly, onOpenNote }: GraphViewProps) {
  const graphNotes = useMemo(() => {
    if (!localOnly || !activeNoteId) return notes
    const active = notes.find((note) => note.id === activeNoteId)
    if (!active) return notes
    const neighbors = outgoingNotes(active, notes)
    const inbound = notes.filter((note) => outgoingNotes(note, notes).some((item) => item.id === active.id))
    const ids = new Set([active.id, ...neighbors.map((note) => note.id), ...inbound.map((note) => note.id)])
    return notes.filter((note) => ids.has(note.id))
  }, [notes, activeNoteId, localOnly])

  const points = useMemo((): Point[] => {
    const width = 760
    const height = 520
    if (graphNotes.length === 1) {
      return [{ note: graphNotes[0], x: width / 2, y: height / 2, radius: 11 }]
    }
    const active = graphNotes.findIndex((note) => note.id === activeNoteId)
    return graphNotes.map((note, index) => {
      if (index === active && graphNotes.length > 1) {
        return { note, x: width / 2, y: height / 2, radius: 11 }
      }
      const ordinaryIndex = index <= active || active < 0 ? index : index - 1
      const count = graphNotes.length - (active >= 0 ? 1 : 0)
      const angle = (ordinaryIndex / Math.max(1, count)) * Math.PI * 2 - Math.PI / 2
      const ring = 180 + ((ordinaryIndex % 3) * 24)
      return {
        note,
        x: width / 2 + Math.cos(angle) * ring,
        y: height / 2 + Math.sin(angle) * ring * 0.72,
        radius: 7,
      }
    })
  }, [graphNotes, activeNoteId])

  const positions = new Map(points.map((point) => [point.note.id, point]))
  const edges = graphNotes.flatMap((note) =>
    outgoingNotes(note, notes)
      .filter((target) => positions.has(target.id))
      .map((target) => ({ source: note.id, target: target.id })),
  )

  if (!notes.length) {
    return <div className="graph-empty">Create a note and link it with [[another note]] to grow your graph.</div>
  }

  return (
    <div className="graph-stage">
      <svg viewBox="0 0 760 520" role="img" aria-label="Note connection graph">
        <defs>
          <filter id="node-glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {edges.map((edge) => {
          const source = positions.get(edge.source)!
          const target = positions.get(edge.target)!
          return (
            <line
              key={`${edge.source}-${edge.target}`}
              className="graph-edge"
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
            />
          )
        })}
        {points.map((point) => {
          const active = point.note.id === activeNoteId
          return (
            <g
              key={point.note.id}
              className={`graph-node ${active ? 'active' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => onOpenNote(point.note.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') onOpenNote(point.note.id)
              }}
            >
              <circle cx={point.x} cy={point.y} r={point.radius + 7} className="graph-node-halo" />
              <circle cx={point.x} cy={point.y} r={point.radius} className="graph-node-dot" filter={active ? 'url(#node-glow)' : undefined} />
              <text x={point.x} y={point.y + point.radius + 19}>{point.note.title || 'Untitled'}</text>
            </g>
          )
        })}
      </svg>
      <div className="graph-legend">
        <span><i className="legend-dot active" /> Current note</span>
        <span><i className="legend-dot" /> Note</span>
        <span>{graphNotes.length} nodes · {edges.length} links</span>
      </div>
    </div>
  )
}
