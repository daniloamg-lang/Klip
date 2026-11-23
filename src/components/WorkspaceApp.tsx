import { useEffect, useMemo, useRef, useState, type ChangeEvent, type SetStateAction } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ArrowLeft,
  ChevronDown,
  Cloud,
  CloudOff,
  Eye,
  FileText,
  FolderOpen,
  Link2,
  LockKeyhole,
  Menu,
  Moon,
  Network,
  PanelLeftClose,
  Pencil,
  Plus,
  Search,
  Sun,
  Trash2,
  X,
} from 'lucide-react'
import { Brand } from './Brand'
import { FolderTree } from './FolderTree'
import { GraphView } from './GraphView'
import { SyncDialog } from './SyncDialog'
import { incomingNotes, markdownWithWikiLinks, noteByTitle, outgoingNotes, renameWikiLinks } from '../lib/links'
import { useTheme } from '../lib/theme'
import { saveVault } from '../lib/vault'
import { sortedNotes, uniqueTitle } from '../lib/workspace'
import {
  createFolder,
  createNote,
  type Folder,
  type Note,
  type Workspace,
} from '../lib/types'

interface WorkspaceAppProps {
  initialWorkspace: Workspace
  cryptoKey: CryptoKey
  onLock: () => void
  onCloudDownloaded: (workspace: Workspace, key: CryptoKey) => void
}

type MainView = 'note' | 'graph'
type EditorMode = 'write' | 'read'

export function WorkspaceApp({
  initialWorkspace,
  cryptoKey,
  onLock,
  onCloudDownloaded,
}: WorkspaceAppProps) {
  const [workspace, setWorkspaceState] = useState(initialWorkspace)
  const [activeNoteId, setActiveNoteId] = useState<string | null>(initialWorkspace.notes[0]?.id ?? null)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null | undefined>(undefined)
  const [expandedIds, setExpandedIds] = useState(new Set<string>())
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [mainView, setMainView] = useState<MainView>('note')
  const [editorMode, setEditorMode] = useState<EditorMode>('write')
  const [localGraph, setLocalGraph] = useState(false)
  const [syncOpen, setSyncOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [mobileNoteOpen, setMobileNoteOpen] = useState(false)
  const [railCollapsed, setRailCollapsed] = useState(false)
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved')
  const [saveError, setSaveError] = useState('')
  const [cursorPosition, setCursorPosition] = useState(0)
  const [theme, toggleTheme] = useTheme()
  const saveSequence = useRef(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function setWorkspace(next: SetStateAction<Workspace>) {
    setSaveState('saving')
    setWorkspaceState(next)
  }

  const activeNote = workspace.notes.find((note) => note.id === activeNoteId) ?? null
  const visibleNotes = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase()
    return sortedNotes(workspace, selectedFolderId).filter((note) => {
      if (!normalized) return true
      return `${note.title}\n${note.content}\n${note.tags.join(' ')}`
        .toLocaleLowerCase()
        .includes(normalized)
    })
  }, [workspace, selectedFolderId, search])
  const backlinks = activeNote ? incomingNotes(activeNote, workspace.notes) : []
  const outgoing = activeNote ? outgoingNotes(activeNote, workspace.notes) : []
  const currentWikiQuery = activeNote ? wikiQuery(activeNote.content, cursorPosition) : null
  const suggestions = activeNote && currentWikiQuery !== null
    ? workspace.notes.filter(
      (note) =>
        note.id !== activeNote.id &&
        note.title.toLocaleLowerCase().includes(currentWikiQuery),
    ).slice(0, 6)
    : []

  useEffect(() => {
    const sequence = ++saveSequence.current
    const timeout = window.setTimeout(() => {
      void saveVault(workspace, cryptoKey)
        .then(() => {
          if (sequence !== saveSequence.current) return
          setSaveState('saved')
          setSaveError('')
        })
        .catch((caught: unknown) => {
          if (sequence !== saveSequence.current) return
          setSaveState('error')
          setSaveError(caught instanceof Error ? caught.message : 'Could not save the vault.')
        })
    }, 350)
    return () => window.clearTimeout(timeout)
  }, [workspace, cryptoKey])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'n') {
        event.preventDefault()
        addNote()
      }
      if (event.key === 'Escape') {
        setSearchOpen(false)
        setSidebarOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  function updateNote(id: string, update: (note: Note) => Note) {
    setWorkspace((current) => ({
      ...current,
      notes: current.notes.map((note) => note.id === id ? update(note) : note),
    }))
  }

  function addNote() {
    const note = createNote(
      selectedFolderId === undefined ? null : selectedFolderId,
      uniqueTitle('Untitled note', workspace.notes.map((item) => item.title)),
    )
    setWorkspace((current) => ({ ...current, notes: [note, ...current.notes] }))
    setActiveNoteId(note.id)
    setMainView('note')
    setEditorMode('write')
    setSidebarOpen(false)
    setMobileNoteOpen(true)
    window.setTimeout(() => textareaRef.current?.focus(), 0)
  }

  function updateTitle(title: string) {
    if (!activeNote || title === activeNote.title) return
    setWorkspace((current) => ({
      ...current,
      notes: current.notes.map((note) => {
        if (note.id === activeNote.id) {
          return { ...note, title, updatedAt: new Date().toISOString() }
        }
        const content = renameWikiLinks(note.content, activeNote.title, title)
        return content === note.content ? note : { ...note, content, updatedAt: new Date().toISOString() }
      }),
    }))
  }

  function removeNote() {
    if (!activeNote || !window.confirm(`Delete “${activeNote.title || 'Untitled note'}”? This cannot be undone.`)) return
    const remaining = workspace.notes.filter((note) => note.id !== activeNote.id)
    setWorkspace((current) => ({ ...current, notes: remaining }))
    setActiveNoteId(remaining[0]?.id ?? null)
  }

  function addFolder(parentId: string | null) {
    const suggested = parentId ? 'Subfolder' : 'New folder'
    const name = window.prompt('Folder name', suggested)?.trim()
    if (!name) return
    const folder = createFolder(name, parentId)
    setWorkspace((current) => ({ ...current, folders: [...current.folders, folder] }))
    setExpandedIds((current) => new Set([...current, ...(parentId ? [parentId] : [])]))
    setSelectedFolderId(folder.id)
  }

  function removeFolder(folder: Folder) {
    if (!window.confirm(`Delete “${folder.name}”? Notes and subfolders will move to the parent level.`)) return
    setWorkspace((current) => ({
      ...current,
      folders: current.folders
        .filter((candidate) => candidate.id !== folder.id)
        .map((candidate) => candidate.parentId === folder.id
          ? { ...candidate, parentId: folder.parentId }
          : candidate),
      notes: current.notes.map((note) => note.folderId === folder.id
        ? { ...note, folderId: folder.parentId, updatedAt: new Date().toISOString() }
        : note),
    }))
    if (selectedFolderId === folder.id) setSelectedFolderId(folder.parentId)
  }

  function openNote(id: string) {
    setActiveNoteId(id)
    setMainView('note')
    setEditorMode('read')
    setSidebarOpen(false)
    setMobileNoteOpen(true)
  }

  function navigateWikiLink(targetTitle: string) {
    const target = noteByTitle(workspace.notes, targetTitle)
    if (target) {
      openNote(target.id)
      return
    }
    const note = createNote(
      activeNote?.folderId ?? null,
      uniqueTitle(targetTitle, workspace.notes.map((item) => item.title)),
    )
    setWorkspace((current) => ({ ...current, notes: [...current.notes, note] }))
    setActiveNoteId(note.id)
    setMainView('note')
    setEditorMode('write')
    setMobileNoteOpen(true)
  }

  function insertWikiLink(note: Note) {
    const textarea = textareaRef.current
    if (!textarea || !activeNote) return
    const cursor = textarea.selectionStart
    const open = activeNote.content.lastIndexOf('[[', cursor)
    const content = `${activeNote.content.slice(0, open)}[[${note.title}]]${activeNote.content.slice(cursor)}`
    const nextCursor = open + note.title.length + 4
    updateNote(activeNote.id, (current) => ({
      ...current,
      content,
      updatedAt: new Date().toISOString(),
    }))
    window.setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(nextCursor, nextCursor)
    }, 0)
  }

  function moveNote(event: ChangeEvent<HTMLSelectElement>) {
    if (!activeNote) return
    updateNote(activeNote.id, (note) => ({
      ...note,
      folderId: event.target.value || null,
      updatedAt: new Date().toISOString(),
    }))
  }

  return (
    <main className={`workspace-shell ${railCollapsed ? 'rail-collapsed' : ''} ${mobileNoteOpen ? 'mobile-note-open' : ''}`}>
      <aside className={`workspace-rail ${sidebarOpen ? 'mobile-open' : ''}`}>
        <div className="rail-header">
          <Brand compact={railCollapsed} />
          <button className="icon-button rail-close" onClick={() => setSidebarOpen(false)} aria-label="Close navigation">
            <X size={18} />
          </button>
        </div>
        <button className="new-note-button" onClick={addNote}>
          <Plus size={17} />
          {!railCollapsed && <span>New note</span>}
          {!railCollapsed && <kbd>⌘ N</kbd>}
        </button>
        <button className="search-button" onClick={() => setSearchOpen(true)}>
          <Search size={16} />
          {!railCollapsed && <span>Search notes</span>}
          {!railCollapsed && <kbd>⌘ K</kbd>}
        </button>
        {!railCollapsed && (
          <>
            <p className="rail-label">Library</p>
            <FolderTree
              workspace={workspace}
              selectedFolderId={selectedFolderId}
              expandedIds={expandedIds}
              onSelect={(id) => {
                setSelectedFolderId(id)
                setSidebarOpen(false)
              }}
              onToggle={(id) => setExpandedIds((current) => {
                const next = new Set(current)
                if (next.has(id)) next.delete(id)
                else next.add(id)
                return next
              })}
              onAddChild={addFolder}
              onDelete={removeFolder}
            />
          </>
        )}
        <div className="rail-spacer" />
        <div className="rail-bottom">
          <button className="rail-icon-button" onClick={() => {
            setMainView('graph')
            setMobileNoteOpen(true)
            setSidebarOpen(false)
          }} title="Connection graph">
            <Network size={17} /> {!railCollapsed && <span>Graph</span>}
          </button>
          <button className="rail-icon-button" onClick={() => setSyncOpen(true)} title="Encrypted cloud sync">
            <Cloud size={17} /> {!railCollapsed && <span>Cloud sync</span>}
          </button>
          <button className="rail-icon-button" onClick={toggleTheme} title="Toggle color theme">
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            {!railCollapsed && <span>{theme === 'dark' ? 'Light theme' : 'Dark theme'}</span>}
          </button>
          <button className="rail-icon-button" onClick={() => setRailCollapsed((value) => !value)} title="Collapse sidebar">
            <PanelLeftClose size={17} />
            {!railCollapsed && <span>Collapse</span>}
          </button>
          <button className="rail-icon-button" onClick={onLock} title="Lock vault">
            <LockKeyhole size={17} />
            {!railCollapsed && <span>Lock vault</span>}
          </button>
          {!railCollapsed && (
            <div className={`save-indicator ${saveState}`}>
              <span />
              {saveState === 'saving' ? 'Saving locally…' : saveState === 'error' ? 'Save failed' : 'Encrypted & saved'}
            </div>
          )}
        </div>
      </aside>

      <section className={`note-index ${sidebarOpen ? 'behind-panel' : ''}`}>
        <header className="index-header">
          <button className="icon-button mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open navigation">
            <Menu size={20} />
          </button>
          <div>
            <p className="eyebrow">Your library</p>
            <h1>{selectedFolderId === undefined
              ? 'All notes'
              : workspace.folders.find((folder) => folder.id === selectedFolderId)?.name ?? 'Unfiled'}</h1>
          </div>
          <button className="icon-button" onClick={addNote} aria-label="Create note">
            <Plus size={19} />
          </button>
        </header>
        <label className="inline-search">
          <Search size={15} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter this list…" />
          {search && <button onClick={() => setSearch('')} aria-label="Clear filter"><X size={14} /></button>}
        </label>
        <div className="note-list">
          {visibleNotes.map((note) => (
            <button
              key={note.id}
              className={`note-list-item ${activeNoteId === note.id && mainView === 'note' ? 'active' : ''}`}
              onClick={() => openNote(note.id)}
            >
              <span className="note-list-icon"><FileText size={15} /></span>
              <span className="note-list-copy">
                <strong>{note.title || 'Untitled note'}</strong>
                <span>{notePreview(note.content)}</span>
                <small>{relativeDate(note.updatedAt)}</small>
              </span>
            </button>
          ))}
          {!visibleNotes.length && (
            <div className="list-empty">
              <FileText size={24} />
              <p>{search ? 'No notes match this search.' : 'No notes here yet.'}</p>
              {!search && <button onClick={addNote}>Create the first one</button>}
            </div>
          )}
        </div>
      </section>

      <section className="main-pane">
        {mainView === 'graph' ? (
          <>
            <header className="main-header graph-header">
              <div className="header-title">
                <button className="icon-button mobile-back" onClick={() => setMainView('note')} aria-label="Back to note">
                  <ArrowLeft size={20} />
                </button>
                <Network size={19} />
                <div>
                  <p className="eyebrow">Knowledge network</p>
                  <h2>Connection graph</h2>
                </div>
              </div>
              <div className="segmented-control">
                <button className={!localGraph ? 'active' : ''} onClick={() => setLocalGraph(false)}>Global</button>
                <button className={localGraph ? 'active' : ''} onClick={() => setLocalGraph(true)} disabled={!activeNote}>Local</button>
              </div>
            </header>
            <GraphView
              notes={workspace.notes}
              activeNoteId={activeNoteId}
              localOnly={localGraph}
              onOpenNote={openNote}
            />
          </>
        ) : activeNote ? (
          <>
            <header className="main-header">
              <button className="icon-button mobile-back" onClick={() => setMobileNoteOpen(false)} aria-label="Back to note list">
                <ArrowLeft size={20} />
              </button>
              <div className="breadcrumb">
                <FolderOpen size={15} />
                <span>{workspace.folders.find((folder) => folder.id === activeNote.folderId)?.name ?? 'All notes'}</span>
              </div>
              <div className="header-actions">
                <div className="segmented-control compact">
                  <button className={editorMode === 'write' ? 'active' : ''} onClick={() => setEditorMode('write')} title="Write">
                    <Pencil size={14} />
                  </button>
                  <button className={editorMode === 'read' ? 'active' : ''} onClick={() => setEditorMode('read')} title="Preview">
                    <Eye size={14} />
                  </button>
                </div>
                <button className="icon-button" onClick={() => {
                  setLocalGraph(true)
                  setMainView('graph')
                }} title="Open local graph">
                  <Network size={17} />
                </button>
                <button className="icon-button danger-icon" onClick={removeNote} title="Delete note">
                  <Trash2 size={17} />
                </button>
              </div>
            </header>
            <div className="note-document">
              <input
                className="note-title"
                aria-label="Note title"
                value={activeNote.title}
                onChange={(event) => updateTitle(event.target.value)}
                placeholder="Untitled note"
              />
              <div className="note-metadata">
                <span>Edited {relativeDate(activeNote.updatedAt)}</span>
                <label>
                  <FolderOpen size={14} />
                  <select value={activeNote.folderId ?? ''} onChange={moveNote} aria-label="Move note to folder">
                    <option value="">All notes</option>
                    {workspace.folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                  </select>
                  <ChevronDown size={13} />
                </label>
              </div>
              <label className="tag-input">
                <span>#</span>
                <input
                  value={activeNote.tags.join(', ')}
                  onChange={(event) => updateNote(activeNote.id, (note) => ({
                    ...note,
                    tags: event.target.value.split(',').map((tag) => tag.trim().replace(/^#/, '')).filter(Boolean),
                    updatedAt: new Date().toISOString(),
                  }))}
                  placeholder="tags, separated by commas"
                />
              </label>
              <div className="editor-wrap">
                {editorMode === 'write' ? (
                  <>
                    <textarea
                      ref={textareaRef}
                      className="note-editor"
                      value={activeNote.content}
                      onChange={(event) => {
                        setCursorPosition(event.target.selectionStart)
                        updateNote(activeNote.id, (note) => ({
                          ...note,
                          content: event.target.value,
                          updatedAt: new Date().toISOString(),
                        }))
                      }}
                      onClick={(event) => setCursorPosition(event.currentTarget.selectionStart)}
                      onKeyUp={(event) => setCursorPosition(event.currentTarget.selectionStart)}
                      onKeyDown={(event) => {
                        if (event.key === 'Tab') {
                          event.preventDefault()
                          const target = event.currentTarget
                          const start = target.selectionStart
                          const end = target.selectionEnd
                          const content = `${activeNote.content.slice(0, start)}  ${activeNote.content.slice(end)}`
                          updateNote(activeNote.id, (note) => ({ ...note, content, updatedAt: new Date().toISOString() }))
                          window.setTimeout(() => target.setSelectionRange(start + 2, start + 2), 0)
                        }
                      }}
                      placeholder={'Start writing…\n\nUse [[Note title]] to connect another page.\nMarkdown is supported.'}
                      spellCheck
                    />
                    {currentWikiQuery !== null && suggestions.length > 0 && (
                      <div className="wiki-suggestions">
                        <span>Link to a note</span>
                        {suggestions.map((note) => (
                          <button key={note.id} onClick={() => insertWikiLink(note)}>
                            <FileText size={14} />
                            {note.title}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="markdown-preview">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        a: ({ href, children, ...props }) => {
                          if (href?.startsWith('#note=')) {
                            return <button className="wiki-link" onClick={() => navigateWikiLink(decodeURIComponent(href.slice(6)))}>
                              {children}
                            </button>
                          }
                          return <a href={href} {...props}>{children}</a>
                        },
                      }}
                    >
                      {markdownWithWikiLinks(activeNote.content)}
                    </ReactMarkdown>
                    {!activeNote.content && <p className="empty-preview">This page is waiting for an idea.</p>}
                  </div>
                )}
              </div>
              <div className="connections-panel">
                <div className="connections-heading">
                  <Link2 size={15} />
                  Connections
                  <span>{backlinks.length + outgoing.length}</span>
                </div>
                <div className="connection-columns">
                  <section>
                    <h3>Links out <span>{outgoing.length}</span></h3>
                    {outgoing.map((note) => (
                      <button key={note.id} onClick={() => openNote(note.id)}><FileText size={14} /> {note.title}</button>
                    ))}
                    {!outgoing.length && <p>Type [[ to link a page.</p>}
                  </section>
                  <section>
                    <h3>Backlinks <span>{backlinks.length}</span></h3>
                    {backlinks.map((note) => (
                      <button key={note.id} onClick={() => openNote(note.id)}><FileText size={14} /> {note.title}</button>
                    ))}
                    {!backlinks.length && <p>No other pages link here yet.</p>}
                  </section>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="workspace-empty">
            <div className="empty-mark"><FileText size={30} /></div>
            <h2>Your next idea starts here</h2>
            <p>Create a page, add a few words, and connect it to something else.</p>
            <button className="primary-button" onClick={addNote}><Plus size={17} /> Create a note</button>
          </div>
        )}
        {saveError && <div className="save-error" role="alert">{saveError}</div>}
      </section>

      {searchOpen && (
        <div className="command-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSearchOpen(false)
        }}>
          <div className="command-palette" role="dialog" aria-modal="true" aria-label="Search notes">
            <label>
              <Search size={18} />
              <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search every note…" />
              <kbd>Esc</kbd>
            </label>
            <div className="command-results">
              {visibleNotes.map((note) => (
                <button key={note.id} onClick={() => {
                  openNote(note.id)
                  setSearchOpen(false)
                }}>
                  <FileText size={16} />
                  <span><strong>{note.title || 'Untitled note'}</strong><small>{notePreview(note.content)}</small></span>
                </button>
              ))}
              {!visibleNotes.length && <p>No matching notes.</p>}
            </div>
            <footer><span><CloudOff size={13} /> Local vault</span><span>{workspace.notes.length} notes</span></footer>
          </div>
        </div>
      )}
      {syncOpen && (
        <SyncDialog
          workspace={workspace}
          cryptoKey={cryptoKey}
          onCloudDownloaded={onCloudDownloaded}
          onClose={() => setSyncOpen(false)}
        />
      )}
    </main>
  )
}

function notePreview(content: string) {
  return content.replace(/[#*`>[\]]/g, '').replace(/\s+/g, ' ').trim() || 'No content yet'
}

function relativeDate(value: string) {
  const delta = Date.now() - new Date(value).getTime()
  if (delta < 60_000) return 'just now'
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`
  if (delta < 604_800_000) return `${Math.floor(delta / 86_400_000)}d ago`
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value))
}

function wikiQuery(content: string, cursor: number): string | null {
  const before = content.slice(0, cursor)
  const open = before.lastIndexOf('[[')
  if (open < 0 || before.lastIndexOf(']]', open) > open) return null
  return before.slice(open + 2).toLocaleLowerCase()
}
