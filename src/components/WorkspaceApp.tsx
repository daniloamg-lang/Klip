import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type SetStateAction } from 'react'
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
  History,
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
import { FolderDialog } from './FolderDialog'
import { HistoryDialog } from './HistoryDialog'
import { GraphView } from './GraphView'
import { SyncDialog } from './SyncDialog'
import type { CloudVault } from './VaultScreen'
import { fetchCloudWorkspace, saveCloudWorkspace } from '../lib/cloud-sync'
import { supabase } from '../lib/supabase'
import { incomingNotes, markdownWithWikiLinks, noteByTitle, outgoingNotes, renameWikiLinks } from '../lib/links'
import { useTheme } from '../lib/theme'
import { decryptCloudWorkspace, replaceVault, saveVault, sealWorkspace } from '../lib/vault'
import { sortedNotes, uniqueTitle } from '../lib/workspace'
import { restoredFromRevision, withRevision } from '../lib/history'
import { useAppBackNavigation } from '../lib/app-back-navigation'
import {
  createFolder,
  createNote,
  type Folder,
  type Note,
  type NoteRevision,
  type Workspace,
} from '../lib/types'

interface WorkspaceAppProps {
  initialWorkspace: Workspace
  cryptoKey: CryptoKey
  cloudVault?: CloudVault
  onLock: () => void
}

type MainView = 'note' | 'graph'
type EditorMode = 'write' | 'read'

export function WorkspaceApp({
  initialWorkspace,
  cryptoKey,
  cloudVault,
  onLock,
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
  const [folderDialogParent, setFolderDialogParent] = useState<string | null | undefined>(undefined)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [mobileNoteOpen, setMobileNoteOpen] = useState(false)
  const [railCollapsed, setRailCollapsed] = useState(false)
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'syncing' | 'error'>('saved')
  const [saveError, setSaveError] = useState('')
  const [cursorPosition, setCursorPosition] = useState(0)
  const [pendingUrl, setPendingUrl] = useState<{
    label: string
    start: number
    end: number
  } | null>(null)
  const [urlInput, setUrlInput] = useState('')
  const [editingLink, setEditingLink] = useState<{ kind: 'page' | 'url'; value: string } | null>(null)
  const [theme, toggleTheme] = useTheme()
  const saveSequence = useRef(0)
  const cloudRevision = useRef(cloudVault?.revision ?? 0)
  const latestWorkspace = useRef(workspace)
  const syncPending = useRef(false)
  const syncBusy = useRef(false)
  const syncQueued = useRef(false)
  const localSaveDirty = useRef(false)
  const skipNextSave = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useAppBackNavigation({
    onBack: () => {
      if (folderDialogParent !== undefined) {
        setFolderDialogParent(undefined)
        return true
      }
      if (pendingUrl) {
        setPendingUrl(null)
        return true
      }
      if (editingLink) {
        setEditingLink(null)
        return true
      }
      if (historyOpen) {
        setHistoryOpen(false)
        return true
      }
      if (syncOpen) {
        setSyncOpen(false)
        return true
      }
      if (searchOpen) {
        setSearchOpen(false)
        return true
      }
      if (sidebarOpen) {
        setSidebarOpen(false)
        return true
      }
      if (mainView === 'graph') {
        setMainView('note')
        return true
      }
      if (mobileNoteOpen) {
        setMobileNoteOpen(false)
        return true
      }
      return false
    },
    exitMessage: 'Do you want to exit Klip?',
  })

  function setWorkspace(next: SetStateAction<Workspace>) {
    localSaveDirty.current = true
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
    latestWorkspace.current = workspace
  }, [workspace])

  const syncToCloud = useCallback(async (snapshot: Workspace) => {
    if (!cloudVault || !supabase) return
    if (syncBusy.current) {
      syncQueued.current = true
      return
    }
    syncBusy.current = true
    try {
      let nextSnapshot = snapshot
      do {
        syncQueued.current = false
        const envelope = await sealWorkspace(
          nextSnapshot,
          cryptoKey,
          cloudVault.userId,
          cloudVault.recovery,
        )
        const revision = await saveCloudWorkspace(
          supabase,
          envelope,
          cloudRevision.current,
          cloudVault.salt,
        )
        cloudRevision.current = revision
        nextSnapshot = latestWorkspace.current
      } while (syncQueued.current)
      syncPending.current = false
    } finally {
      syncBusy.current = false
    }
  }, [cloudVault, cryptoKey])

  useEffect(() => {
    if (skipNextSave.current) {
      skipNextSave.current = false
      return
    }
    const sequence = ++saveSequence.current
    const timeout = window.setTimeout(() => {
      void saveVault(workspace, cryptoKey)
        .then(async () => {
          if (sequence === saveSequence.current) localSaveDirty.current = false
          if (cloudVault && supabase) {
            syncPending.current = true
            if (sequence === saveSequence.current) setSaveState('syncing')
            await syncToCloud(workspace)
          }
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
  }, [workspace, cryptoKey, cloudVault, syncToCloud])

  useEffect(() => {
    const client = supabase
    if (!cloudVault || !client) return
    const syncFromCloud = async () => {
      if (localSaveDirty.current || syncBusy.current || syncPending.current) {
        if (syncPending.current && !syncBusy.current) {
          try {
            await syncToCloud(latestWorkspace.current)
            setSaveState('saved')
            setSaveError('')
          } catch (caught) {
            setSaveState('error')
            setSaveError(caught instanceof Error ? caught.message : 'Cloud sync failed.')
          }
        }
        return
      }
      try {
        const remote = await fetchCloudWorkspace(client)
        if (!remote || remote.revision <= cloudRevision.current) return
        const nextWorkspace = await decryptCloudWorkspace(
          cloudVault.userId,
          cryptoKey,
          remote.payload,
        )
        await replaceVault(nextWorkspace, cryptoKey, cloudVault.salt, cloudVault.recovery)
        cloudRevision.current = remote.revision
        skipNextSave.current = true
        setWorkspaceState(nextWorkspace)
        setActiveNoteId((current) =>
          nextWorkspace.notes.some((note) => note.id === current)
            ? current
            : nextWorkspace.notes[0]?.id ?? null,
        )
        setSaveError('')
      } catch (caught) {
        setSaveState('error')
        setSaveError(caught instanceof Error ? caught.message : 'Could not refresh the cloud vault.')
      }
    }
    const interval = window.setInterval(() => void syncFromCloud(), 20_000)
    return () => window.clearInterval(interval)
  }, [cloudVault, cryptoKey, syncToCloud])

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
        setFolderDialogParent(undefined)
        setHistoryOpen(false)
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
          return {
            ...withRevision(note),
            title,
            updatedAt: new Date().toISOString(),
          }
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
    setFolderDialogParent(parentId)
  }

  function createFolderFromDialog(name: string) {
    const parentId = folderDialogParent ?? null
    const folder = createFolder(name, parentId)
    setWorkspace((current) => ({ ...current, folders: [...current.folders, folder] }))
    setExpandedIds((current) => new Set([...current, ...(parentId ? [parentId] : [])]))
    setSelectedFolderId(folder.id)
    setFolderDialogParent(undefined)
    setSidebarOpen(false)
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
    setEditorMode('write')
    setSidebarOpen(false)
    setMobileNoteOpen(true)
    setHistoryOpen(false)
    window.setTimeout(() => textareaRef.current?.focus(), 0)
  }

  function updateContent(content: string) {
    if (!activeNote || content === activeNote.content) return
    updateNote(activeNote.id, (note) => ({
      ...withRevision(note),
      content,
      updatedAt: new Date().toISOString(),
    }))
  }

  function handleEditorChange(content: string, cursor: number) {
    const before = content.slice(0, cursor)
    const completed = before.match(/::([^:\n]+)::$/)
    const alreadyConfigured = completed && content.slice(cursor).startsWith('(')
    if (completed && !alreadyConfigured) {
      const start = cursor - completed[0].length
      setPendingUrl({
        label: completed[1].trim(),
        start,
        end: cursor,
      })
      setUrlInput('')
    }
    updateContent(content)
  }

  function savePendingUrl(event: React.FormEvent) {
    event.preventDefault()
    if (!activeNote || !pendingUrl) return
    const url = normalizeUrl(urlInput)
    const replacement = `::${pendingUrl.label}::(${url})`
    updateContent(
      activeNote.content.slice(0, pendingUrl.start) +
      replacement +
      activeNote.content.slice(pendingUrl.end),
    )
    setPendingUrl(null)
    window.setTimeout(() => textareaRef.current?.focus(), 0)
  }

  function editRenderedLink(kind: 'page' | 'url', value: string) {
    setEditingLink({ kind, value })
    const [, current] = value.split('\u0000')
    setUrlInput(current ?? '')
  }

  function saveRenderedLink(event: React.FormEvent) {
    event.preventDefault()
    if (!activeNote || !editingLink) return
    if (editingLink.kind === 'url') {
      const [label, oldUrl] = editingLink.value.split('\u0000')
      const nextUrl = normalizeUrl(urlInput)
      updateContent(activeNote.content.replace(
        `::${label}::(${oldUrl})`,
        `::${label}::(${nextUrl})`,
      ))
    } else {
      const [label, oldTarget] = editingLink.value.split('\u0000')
      const replacement = `;;${label}|${urlInput.trim()};;`
      updateContent(replacePageLink(
        activeNote.content,
        label,
        oldTarget,
        replacement,
      ))
    }
    setEditingLink(null)
  }

  function onLinkPointerDown(
    event: React.PointerEvent<HTMLElement>,
    kind: 'page' | 'url',
    value: string,
  ) {
    const element = event.currentTarget
    const timer = window.setTimeout(() => {
      editRenderedLink(kind, value)
      element.dataset.longPressed = 'true'
    }, 550)
    element.dataset.longPressTimer = String(timer)
  }

  function onLinkPointerUp(event: React.PointerEvent<HTMLElement>) {
    const value = event.currentTarget.dataset.longPressTimer
    if (value) window.clearTimeout(Number(value))
  }

  function restoreRevision(revision: NoteRevision) {
    if (!activeNote) return
    updateNote(activeNote.id, (note) => restoredFromRevision(note, revision))
    setHistoryOpen(false)
    setEditorMode('write')
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
    const doubleBracketOpen = activeNote.content.lastIndexOf('[[', cursor)
    const semicolonOpen = activeNote.content.lastIndexOf(';;', cursor)
    const open = Math.max(doubleBracketOpen, semicolonOpen)
    const replacement = doubleBracketOpen > semicolonOpen
      ? `[[${note.title}]]`
      : `;;${note.title};;`
    const content = `${activeNote.content.slice(0, open)}${replacement}${activeNote.content.slice(cursor)}`
    const nextCursor = open + replacement.length
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
      {sidebarOpen && (
        <button
          type="button"
          className="mobile-sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close navigation"
        />
      )}
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
              {saveState === 'saving'
                ? 'Saving locally…'
                : saveState === 'syncing'
                  ? 'Syncing securely…'
                  : saveState === 'error'
                    ? 'Sync needs attention'
                    : cloudVault ? 'Encrypted & synced' : 'Encrypted & saved'}
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
                <button className="icon-button" onClick={() => setHistoryOpen(true)} title="Version history">
                  <History size={17} />
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
                        handleEditorChange(event.target.value, event.target.selectionStart)
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
                          updateContent(content)
                          window.setTimeout(() => target.setSelectionRange(start + 2, start + 2), 0)
                        }
                      }}
                      placeholder={'Start writing…\n\nUse ;;Page title;; to link a page.\nUse ::Label:: to add a URL.\nMarkdown is supported.'}
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
                            const target = decodeURIComponent(href.slice(6))
                            const label = String(children)
                            return <button
                              className="wiki-link"
                              onPointerDown={(event) => onLinkPointerDown(event, 'page', `${label}\u0000${target}`)}
                              onPointerUp={onLinkPointerUp}
                              onPointerLeave={onLinkPointerUp}
                              onClick={(event) => {
                                if (event.currentTarget.dataset.longPressed === 'true') {
                                  event.currentTarget.dataset.longPressed = 'false'
                                  return
                                }
                                navigateWikiLink(target)
                              }}
                            >
                              {children}
                            </button>
                          }
                          const label = String(children)
                          return <a
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            onPointerDown={(event) => onLinkPointerDown(event, 'url', `${label}\u0000${href ?? ''}`)}
                            onPointerUp={onLinkPointerUp}
                            onPointerLeave={onLinkPointerUp}
                            onClick={(event) => {
                              if (event.currentTarget.dataset.longPressed === 'true') {
                                event.preventDefault()
                                event.currentTarget.dataset.longPressed = 'false'
                              }
                            }}
                            {...props}
                          >{children}</a>
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
                    {!outgoing.length && <p>Type ;; to link a page.</p>}
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
          onSignedOut={onLock}
          onClose={() => setSyncOpen(false)}
        />
      )}
      {pendingUrl && (
        <LinkDialog
          title={`Add URL for “${pendingUrl.label}”`}
          value={urlInput}
          onValueChange={setUrlInput}
          onClose={() => setPendingUrl(null)}
          onSubmit={savePendingUrl}
          placeholder="https://example.com"
        />
      )}
      {editingLink && (
        <LinkDialog
          title={editingLink.kind === 'url' ? 'Edit link URL' : 'Edit page link'}
          value={urlInput}
          onValueChange={setUrlInput}
          onClose={() => setEditingLink(null)}
          onSubmit={saveRenderedLink}
          placeholder={editingLink.kind === 'url' ? 'https://example.com' : 'Note title'}
        />
      )}
      {folderDialogParent !== undefined && (
        <FolderDialog
          parentName={workspace.folders.find((folder) => folder.id === folderDialogParent)?.name}
          existingNames={workspace.folders
            .filter((folder) => folder.parentId === folderDialogParent)
            .map((folder) => folder.name)}
          onCreate={createFolderFromDialog}
          onClose={() => setFolderDialogParent(undefined)}
        />
      )}
      {historyOpen && activeNote && (
        <HistoryDialog
          note={activeNote}
          onRestore={restoreRevision}
          onClose={() => setHistoryOpen(false)}
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
  const doubleBracketOpen = before.lastIndexOf('[[')
  const semicolonOpen = before.lastIndexOf(';;', cursor)
  const open = Math.max(doubleBracketOpen, semicolonOpen)
  if (open < 0) return null
  const closing = open === doubleBracketOpen ? ']]' : ';;'
  const query = before.slice(open + 2)
  if (query.includes(closing)) return null
  return query.toLocaleLowerCase()
}

function normalizeUrl(value: string): string {
  const trimmed = value.trim()
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function replacePageLink(
  content: string,
  label: string,
  oldTarget: string,
  replacement: string,
): string {
  const candidates = [
    `;;${label}|${oldTarget};;`,
    `;;${oldTarget};;`,
    `[[${oldTarget}|${label}]]`,
  ]
  for (const candidate of candidates) {
    if (content.includes(candidate)) return content.replace(candidate, replacement)
  }
  return content
}

interface LinkDialogProps {
  title: string
  value: string
  placeholder: string
  onValueChange: (value: string) => void
  onClose: () => void
  onSubmit: (event: React.FormEvent) => void
}

function LinkDialog({
  title,
  value,
  placeholder,
  onValueChange,
  onClose,
  onSubmit,
}: LinkDialogProps) {
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="link-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <button className="icon-button dialog-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <h2>{title}</h2>
        <form onSubmit={onSubmit}>
          <label>
            Destination
            <input
              autoFocus
              required
              value={value}
              onChange={(event) => onValueChange(event.target.value)}
              placeholder={placeholder}
            />
          </label>
          <div className="folder-dialog-actions">
            <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
            <button className="primary-button" type="submit">Save link</button>
          </div>
        </form>
      </section>
    </div>
  )
}
