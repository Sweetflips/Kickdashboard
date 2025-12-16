'use client'

import { Toast } from '@/components/Toast'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

type Note = {
  id: string
  title: string
  content: string
  created_by: { id: string; username: string; profile_picture_url: string | null }
  created_at: string
  updated_at: string
}

export default function AdminNotesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [notes, setNotes] = useState<Note[]>([])
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const [query, setQuery] = useState('')

  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<{ title: string; content: string }>({ title: '', content: '' })

  const [editing, setEditing] = useState<Note | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const token = useMemo(() => (typeof window !== 'undefined' ? localStorage.getItem('kick_access_token') : null), [])

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        if (!token) {
          router.push('/')
          return
        }
        const resp = await fetch('/api/admin/verify', { headers: { Authorization: `Bearer ${token}` } })
        const data = await resp.json().catch(() => ({}))
        if (!resp.ok || !data.is_admin) {
          router.push('/')
          return
        }
        setIsAdmin(true)
      } catch {
        router.push('/')
      } finally {
        setLoading(false)
      }
    }
    checkAdmin()
  }, [router, token])

  const fetchNotes = async () => {
    if (!token) return
    try {
      const resp = await fetch('/api/admin/notes', { headers: { Authorization: `Bearer ${token}` } })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data?.error || 'Failed to fetch notes')
      setNotes(data?.notes || [])
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : 'Failed to fetch notes', type: 'error' })
    }
  }

  useEffect(() => {
    if (!isAdmin) return
    fetchNotes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return notes
    return notes.filter((n) => {
      const hay = `${n.title}\n${n.content}\n${n.created_by?.username || ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [notes, query])

  const resetForm = () => setForm({ title: '', content: '' })

  const createNote = async () => {
    if (!token) return
    const title = form.title.trim()
    const content = form.content.trim()
    if (!title || !content) {
      setToast({ message: 'Title + notes are required', type: 'error' })
      return
    }

    setSaving(true)
    try {
      const resp = await fetch('/api/admin/notes', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data?.error || 'Failed to create note')
      setToast({ message: 'Note created', type: 'success' })
      setShowCreate(false)
      resetForm()
      await fetchNotes()
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : 'Failed to create note', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const updateNote = async () => {
    if (!token || !editing) return
    const title = form.title.trim()
    const content = form.content.trim()
    if (!title || !content) {
      setToast({ message: 'Title + notes are required', type: 'error' })
      return
    }

    setSaving(true)
    try {
      const resp = await fetch(`/api/admin/notes/${editing.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data?.error || 'Failed to update note')
      setToast({ message: 'Note updated', type: 'success' })
      setEditing(null)
      resetForm()
      await fetchNotes()
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : 'Failed to update note', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const deleteNote = async (id: string) => {
    if (!token) return
    const ok = confirm('Delete this note?')
    if (!ok) return
    try {
      const resp = await fetch(`/api/admin/notes/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(data?.error || 'Failed to delete note')
      setToast({ message: 'Note deleted', type: 'success' })
      await fetchNotes()
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : 'Failed to delete note', type: 'error' })
    }
  }

  if (loading || !isAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kick-purple"></div>
      </div>
    )
  }

  const openCreate = () => {
    setEditing(null)
    resetForm()
    setShowCreate(true)
  }

  const openEdit = (n: Note) => {
    setShowCreate(false)
    setEditing(n)
    setForm({ title: n.title, content: n.content })
  }

  const closeModal = () => {
    setShowCreate(false)
    setEditing(null)
    resetForm()
  }

  const modalTitle = editing ? 'Edit Note' : 'New Note'
  const modalAction = editing ? updateNote : createNote

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-h1 font-semibold text-gray-900 dark:text-kick-text">Notes</h1>
          <p className="text-body text-gray-600 dark:text-kick-text-secondary mt-1">Meeting notes for the team.</p>
        </div>
        <button onClick={openCreate} className="px-6 py-2 bg-kick-purple text-white rounded-lg hover:bg-kick-purple-dark transition-colors">
          + New Note
        </button>
      </div>

      <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-4">
        <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div className="flex-1">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notes…"
              className="w-full px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text"
            />
          </div>
          <button
            onClick={fetchNotes}
            className="px-4 py-2 bg-gray-200 dark:bg-kick-surface-hover text-gray-900 dark:text-kick-text rounded-lg hover:bg-gray-300 dark:hover:bg-kick-dark transition-colors text-sm font-medium"
          >
            Refresh
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border">
          <h3 className="text-h4 font-semibold text-gray-900 dark:text-kick-text mb-2">No notes yet</h3>
          <p className="text-body text-gray-600 dark:text-kick-text-secondary mb-4">Create your first meeting note.</p>
          <button onClick={openCreate} className="px-6 py-2 bg-kick-purple text-white rounded-lg hover:bg-kick-purple-dark transition-colors">
            New Note
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((n) => {
            const isExpanded = expanded[n.id] === true
            const created = new Date(n.created_at).toLocaleString()
            const updated = new Date(n.updated_at).toLocaleString()
            return (
              <div key={n.id} className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-h4 font-semibold text-gray-900 dark:text-kick-text truncate">{n.title}</h3>
                    </div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-kick-text-muted">
                      By <span className="font-medium">{n.created_by?.username || 'Unknown'}</span> • Created {created}
                      {n.updated_at !== n.created_at ? <span> • Updated {updated}</span> : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setExpanded((s) => ({ ...s, [n.id]: !isExpanded }))}
                      className="px-3 py-1 text-xs bg-gray-200 dark:bg-kick-surface-hover text-gray-700 dark:text-kick-text rounded hover:bg-gray-300 dark:hover:bg-kick-dark"
                    >
                      {isExpanded ? 'Collapse' : 'Expand'}
                    </button>
                    <button
                      onClick={() => openEdit(n)}
                      className="px-3 py-1 text-xs bg-gray-200 dark:bg-kick-surface-hover text-gray-700 dark:text-kick-text rounded hover:bg-gray-300 dark:hover:bg-kick-dark"
                    >
                      Edit
                    </button>
                    <button onClick={() => deleteNote(n.id)} className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700">
                      Delete
                    </button>
                  </div>
                </div>

                <div className="mt-4">
                  <div className={`text-sm text-gray-800 dark:text-kick-text whitespace-pre-wrap ${isExpanded ? '' : 'line-clamp-4'}`}>
                    {n.content}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {(showCreate || editing) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-kick-surface rounded-xl max-w-2xl w-full overflow-hidden">
            <div className="p-6 border-b border-gray-200 dark:border-kick-border">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-h3 font-semibold text-gray-900 dark:text-kick-text">{modalTitle}</h2>
                  <p className="text-small text-gray-600 dark:text-kick-text-secondary mt-1">Paste meeting notes from calls, docs, etc.</p>
                </div>
                <button onClick={closeModal} className="text-gray-500 hover:text-gray-700 dark:text-kick-text-secondary dark:hover:text-kick-text">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-small font-medium text-gray-700 dark:text-kick-text-secondary mb-2">Title</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
                  placeholder="e.g. Weekly meeting - 2025-12-16"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text"
                />
              </div>

              <div>
                <label className="block text-small font-medium text-gray-700 dark:text-kick-text-secondary mb-2">Notes</label>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm((s) => ({ ...s, content: e.target.value }))}
                  placeholder="- Agenda…\n- Decisions…\n- Action items…"
                  rows={10}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text font-mono text-sm"
                />
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 dark:border-kick-border flex justify-end gap-2">
              <button
                onClick={closeModal}
                className="px-4 py-2 bg-gray-200 dark:bg-kick-surface-hover text-gray-900 dark:text-kick-text rounded-lg hover:bg-gray-300 dark:hover:bg-kick-dark transition-colors"
              >
                Cancel
              </button>
              <button onClick={modalAction} disabled={saving} className="px-4 py-2 bg-kick-purple text-white rounded-lg disabled:opacity-50">
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Note'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}


