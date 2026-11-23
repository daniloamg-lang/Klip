import { useState, type FormEvent } from 'react'
import { FolderPlus, X } from 'lucide-react'

interface FolderDialogProps {
  parentName?: string
  existingNames: string[]
  onCreate: (name: string) => void
  onClose: () => void
}

export function FolderDialog({
  parentName,
  existingNames,
  onCreate,
  onClose,
}: FolderDialogProps) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  function submit(event: FormEvent) {
    event.preventDefault()
    const nextName = name.trim()
    if (!nextName) {
      setError('Enter a folder name.')
      return
    }
    if (existingNames.some((existing) => existing.toLocaleLowerCase() === nextName.toLocaleLowerCase())) {
      setError('A folder with this name already exists here.')
      return
    }
    onCreate(nextName)
  }

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section className="folder-dialog" role="dialog" aria-modal="true" aria-labelledby="folder-dialog-title">
        <button className="icon-button dialog-close" onClick={onClose} aria-label="Close folder dialog">
          <X size={18} />
        </button>
        <div className="folder-dialog-icon"><FolderPlus size={24} /></div>
        <p className="eyebrow">{parentName ? `Inside ${parentName}` : 'Library organization'}</p>
        <h2 id="folder-dialog-title">{parentName ? 'New subfolder' : 'New folder'}</h2>
        <p className="folder-dialog-copy">
          {parentName
            ? `Create a folder inside “${parentName}”.`
            : 'Create a place for related notes.'}
        </p>
        <form onSubmit={submit}>
          <label>
            Folder name
            <input
              autoFocus
              maxLength={80}
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                setError('')
              }}
              placeholder="e.g. Ideas, Reading, Projects"
            />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="folder-dialog-actions">
            <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
            <button className="primary-button">
              <FolderPlus size={16} />
              Create folder
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
