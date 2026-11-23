import { useState } from 'react'
import { History, RotateCcw, X } from 'lucide-react'
import type { Note, NoteRevision } from '../lib/types'

interface HistoryDialogProps {
  note: Note
  onRestore: (revision: NoteRevision) => void
  onClose: () => void
}

export function HistoryDialog({ note, onRestore, onClose }: HistoryDialogProps) {
  const revisions = [...(note.revisions ?? [])].reverse()
  const [selectedId, setSelectedId] = useState<string | null>(revisions[0]?.id ?? null)
  const selected = revisions.find((revision) => revision.id === selectedId)

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="history-dialog" role="dialog" aria-modal="true" aria-label="Version history">
        <header>
          <div className="history-title">
            <History size={18} />
            <div><p className="eyebrow">Version history</p><h2>{note.title || 'Untitled note'}</h2></div>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close history"><X size={18} /></button>
        </header>
        {revisions.length ? (
          <div className="history-body">
            <aside className="history-list">
              {revisions.map((revision, index) => (
                <button
                  key={revision.id}
                  className={selectedId === revision.id ? 'active' : ''}
                  onClick={() => setSelectedId(revision.id)}
                >
                  <strong>{index === 0 ? 'Latest saved version' : `Version ${revisions.length - index}`}</strong>
                  <span>{new Intl.DateTimeFormat(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(revision.savedAt))}</span>
                </button>
              ))}
            </aside>
            <div className="history-preview">
              {selected && (
                <>
                  <div className="history-preview-header">
                    <h3>{selected.title || 'Untitled note'}</h3>
                    <button className="primary-button" onClick={() => onRestore(selected)}>
                      <RotateCcw size={15} />
                      Restore
                    </button>
                  </div>
                  <div className="history-content">{selected.content || 'This version was empty.'}</div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="history-empty">
            <History size={28} />
            <p>No previous versions yet.</p>
            <span>Klip saves the state before a new editing session begins.</span>
          </div>
        )}
      </section>
    </div>
  )
}
