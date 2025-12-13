'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'all'
type ActiveTab = 'sweet_coins' | 'chat'

type Summary = {
  queues: {
    sweet_coins: { pending: number; processing: number; completed: number; failed: number; staleLocks: number }
    chat: { pending: number; processing: number; completed: number; failed: number; staleLocks: number }
  }
  timestamp: string
}

type SweetCoinJobRow = {
  type: 'sweet_coins'
  id: string
  status: string
  attempts: number
  message_id: string
  kick_user_id: string
  username: string | null
  stream_session_id: string | null
  badges_count: number | null
  emotes_count: number | null
  locked_at: string | null
  processed_at: string | null
  created_at: string
  updated_at: string
  last_error: string | null
}

type ChatJobRow = {
  type: 'chat'
  id: string
  status: string
  attempts: number
  message_id: string
  sender_user_id: string
  sender_username: string | null
  broadcaster_user_id: string
  broadcaster_username: string | null
  stream_session_id: string | null
  content_preview: string | null
  locked_at: string | null
  processed_at: string | null
  created_at: string
  updated_at: string
  last_error: string | null
}

function Badge({ status }: { status: string }) {
  const cls =
    status === 'pending'
      ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
      : status === 'processing'
        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
        : status === 'completed'
          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
          : status === 'failed'
            ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
            : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'

  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{status}</span>
}

function formatTime(ts: string | null) {
  if (!ts) return '—'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString()
}

export default function AdminTasksPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [tab, setTab] = useState<ActiveTab>('sweet_coins')

  const [summary, setSummary] = useState<Summary | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(true)

  const [status, setStatus] = useState<JobStatus>('all')
  const [q, setQ] = useState('')
  const [onlyStale, setOnlyStale] = useState(false)
  const [sinceHours, setSinceHours] = useState<number>(24)
  const [offset, setOffset] = useState(0)
  const limit = 50

  const [sweetJobs, setSweetJobs] = useState<SweetCoinJobRow[]>([])
  const [sweetTotal, setSweetTotal] = useState(0)
  const [chatJobs, setChatJobs] = useState<ChatJobRow[]>([])
  const [chatTotal, setChatTotal] = useState(0)
  const [loadingTable, setLoadingTable] = useState(true)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [drawerTitle, setDrawerTitle] = useState<string>('')
  const [drawerJson, setDrawerJson] = useState<any>(null)

  const token = useMemo(() => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem('kick_access_token')
  }, [])

  useEffect(() => {
    const t = localStorage.getItem('kick_access_token')
    if (!t) {
      router.push('/')
      return
    }

    fetch('/api/admin/verify', { headers: { Authorization: `Bearer ${t}` } })
      .then(res => res.json())
      .then(data => {
        if (!data.is_admin) {
          router.push('/')
          return
        }
        setReady(true)
      })
      .catch(() => router.push('/'))
  }, [router])

  const fetchSummary = async () => {
    if (!token) return
    setLoadingSummary(true)
    try {
      const res = await fetch('/api/admin/tasks/summary', { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (res.ok && data?.success) setSummary(data)
    } finally {
      setLoadingSummary(false)
    }
  }

  const fetchTable = async () => {
    if (!token) return
    setLoadingTable(true)
    try {
      const params = new URLSearchParams()
      params.set('limit', String(limit))
      params.set('offset', String(offset))
      if (status && status !== 'all') params.set('status', status)
      if (q.trim()) params.set('q', q.trim())
      if (onlyStale) params.set('onlyStale', 'true')
      if (sinceHours > 0) params.set('sinceHours', String(sinceHours))

      const url = tab === 'sweet_coins' ? `/api/admin/tasks/sweet-coins?${params}` : `/api/admin/tasks/chat?${params}`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (!res.ok) return

      if (tab === 'sweet_coins') {
        setSweetJobs(Array.isArray(data.jobs) ? data.jobs : [])
        setSweetTotal(typeof data.total === 'number' ? data.total : 0)
      } else {
        setChatJobs(Array.isArray(data.jobs) ? data.jobs : [])
        setChatTotal(typeof data.total === 'number' ? data.total : 0)
      }
    } finally {
      setLoadingTable(false)
    }
  }

  useEffect(() => {
    if (!ready) return
    fetchSummary()
    fetchTable()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, tab, offset])

  useEffect(() => {
    if (!ready) return
    setOffset(0)
    fetchTable()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, onlyStale, sinceHours])

  useEffect(() => {
    if (!ready) return
    const t = window.setTimeout(() => {
      setOffset(0)
      fetchTable()
    }, 250)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const openDrawer = async (row: SweetCoinJobRow | ChatJobRow) => {
    if (!token) return
    setDrawerOpen(true)
    setDrawerLoading(true)
    setDrawerTitle(`${row.type === 'sweet_coins' ? 'Sweet Coins' : 'Chat'} • Job #${row.id}`)
    setDrawerJson(null)
    try {
      const url =
        row.type === 'sweet_coins'
          ? `/api/admin/tasks/sweet-coins/${encodeURIComponent(row.id)}`
          : `/api/admin/tasks/chat/${encodeURIComponent(row.id)}`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (res.ok && data?.success) {
        setDrawerJson(data.job)
      } else {
        setDrawerJson({ error: data?.error || 'Failed to load job detail' })
      }
    } finally {
      setDrawerLoading(false)
    }
  }

  const activeRows = tab === 'sweet_coins' ? sweetJobs : chatJobs
  const activeTotal = tab === 'sweet_coins' ? sweetTotal : chatTotal

  if (!ready) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kick-purple"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-kick-surface rounded-lg shadow-sm border border-gray-200 dark:border-kick-border p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-kick-text">Task Manager</h1>
            <p className="text-sm text-gray-600 dark:text-kick-text-secondary mt-1">
              Queue-backed jobs (Sweet Coins awards + Chat writes)
            </p>
          </div>
          <button
            onClick={() => {
              fetchSummary()
              fetchTable()
            }}
            className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-kick-surface-hover text-gray-700 dark:text-kick-text hover:bg-gray-200 dark:hover:bg-kick-surface transition-colors text-sm font-medium"
          >
            Refresh
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {loadingSummary || !summary ? (
            <div className="col-span-full text-sm text-gray-600 dark:text-kick-text-secondary">Loading queue stats…</div>
          ) : (
            <>
              <div className="rounded-lg border border-gray-200 dark:border-kick-border bg-white dark:bg-kick-dark p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-900 dark:text-kick-text">Sweet Coins Queue</div>
                  <div className="text-xs text-gray-500 dark:text-kick-text-secondary">{new Date(summary.timestamp).toLocaleTimeString()}</div>
                </div>
                <div className="mt-3 grid grid-cols-5 gap-2 text-sm">
                  <div><div className="text-xs text-gray-500 dark:text-kick-text-secondary">Pending</div><div className="font-semibold">{summary.queues.sweet_coins.pending}</div></div>
                  <div><div className="text-xs text-gray-500 dark:text-kick-text-secondary">Processing</div><div className="font-semibold">{summary.queues.sweet_coins.processing}</div></div>
                  <div><div className="text-xs text-gray-500 dark:text-kick-text-secondary">Done</div><div className="font-semibold">{summary.queues.sweet_coins.completed}</div></div>
                  <div><div className="text-xs text-gray-500 dark:text-kick-text-secondary">Failed</div><div className="font-semibold">{summary.queues.sweet_coins.failed}</div></div>
                  <div><div className="text-xs text-gray-500 dark:text-kick-text-secondary">Stale</div><div className="font-semibold text-red-600 dark:text-red-400">{summary.queues.sweet_coins.staleLocks}</div></div>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-kick-border bg-white dark:bg-kick-dark p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-900 dark:text-kick-text">Chat Queue</div>
                  <div className="text-xs text-gray-500 dark:text-kick-text-secondary">{new Date(summary.timestamp).toLocaleTimeString()}</div>
                </div>
                <div className="mt-3 grid grid-cols-5 gap-2 text-sm">
                  <div><div className="text-xs text-gray-500 dark:text-kick-text-secondary">Pending</div><div className="font-semibold">{summary.queues.chat.pending}</div></div>
                  <div><div className="text-xs text-gray-500 dark:text-kick-text-secondary">Processing</div><div className="font-semibold">{summary.queues.chat.processing}</div></div>
                  <div><div className="text-xs text-gray-500 dark:text-kick-text-secondary">Done</div><div className="font-semibold">{summary.queues.chat.completed}</div></div>
                  <div><div className="text-xs text-gray-500 dark:text-kick-text-secondary">Failed</div><div className="font-semibold">{summary.queues.chat.failed}</div></div>
                  <div><div className="text-xs text-gray-500 dark:text-kick-text-secondary">Stale</div><div className="font-semibold text-red-600 dark:text-red-400">{summary.queues.chat.staleLocks}</div></div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => {
              setTab('sweet_coins')
              setOffset(0)
            }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
              tab === 'sweet_coins'
                ? 'bg-kick-purple/10 text-kick-purple border-kick-purple/30'
                : 'bg-white dark:bg-kick-dark text-gray-700 dark:text-kick-text-secondary border-gray-200 dark:border-kick-border hover:bg-gray-50 dark:hover:bg-kick-surface-hover'
            }`}
          >
            Sweet Coins Jobs
          </button>
          <button
            onClick={() => {
              setTab('chat')
              setOffset(0)
            }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
              tab === 'chat'
                ? 'bg-kick-purple/10 text-kick-purple border-kick-purple/30'
                : 'bg-white dark:bg-kick-dark text-gray-700 dark:text-kick-text-secondary border-gray-200 dark:border-kick-border hover:bg-gray-50 dark:hover:bg-kick-surface-hover'
            }`}
          >
            Chat Jobs
          </button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search: message_id, user id, username, content…"
            className="md:col-span-2 w-full px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text focus:ring-2 focus:ring-kick-purple focus:border-transparent"
          />
          <select
            value={status}
            onChange={e => setStatus(e.target.value as JobStatus)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text"
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
          <select
            value={sinceHours}
            onChange={e => setSinceHours(parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text"
          >
            <option value={0}>All time</option>
            <option value={24}>Last 24h</option>
            <option value={168}>Last 7d</option>
            <option value={720}>Last 30d</option>
          </select>
          <label className="flex items-center gap-2 md:col-span-4">
            <input
              type="checkbox"
              checked={onlyStale}
              onChange={e => setOnlyStale(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 dark:border-kick-border text-kick-purple focus:ring-kick-purple"
            />
            <span className="text-sm text-gray-700 dark:text-kick-text-secondary font-medium">Only stale locks (processing &gt; 5m)</span>
          </label>
        </div>

        {/* Table */}
        <div className="overflow-x-auto border border-gray-200 dark:border-kick-border rounded-lg">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-kick-dark border-b border-gray-200 dark:border-kick-border">
              <tr className="text-left">
                <th className="px-4 py-3 font-semibold text-gray-700 dark:text-kick-text-secondary">Status</th>
                <th className="px-4 py-3 font-semibold text-gray-700 dark:text-kick-text-secondary">Message ID</th>
                <th className="px-4 py-3 font-semibold text-gray-700 dark:text-kick-text-secondary">{tab === 'sweet_coins' ? 'User' : 'Sender → Broadcaster'}</th>
                <th className="px-4 py-3 font-semibold text-gray-700 dark:text-kick-text-secondary">Attempts</th>
                <th className="px-4 py-3 font-semibold text-gray-700 dark:text-kick-text-secondary">Created</th>
                <th className="px-4 py-3 font-semibold text-gray-700 dark:text-kick-text-secondary">Locked</th>
                <th className="px-4 py-3 font-semibold text-gray-700 dark:text-kick-text-secondary">Processed</th>
                <th className="px-4 py-3 font-semibold text-gray-700 dark:text-kick-text-secondary">Error</th>
                <th className="px-4 py-3 font-semibold text-gray-700 dark:text-kick-text-secondary text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-kick-border">
              {loadingTable ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-gray-600 dark:text-kick-text-secondary">
                    Loading…
                  </td>
                </tr>
              ) : activeRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-gray-600 dark:text-kick-text-secondary">
                    No jobs found.
                  </td>
                </tr>
              ) : (
                activeRows.map((row: any) => (
                  <tr key={`${row.type}:${row.id}`} className="hover:bg-gray-50 dark:hover:bg-kick-surface-hover">
                    <td className="px-4 py-3"><Badge status={row.status} /></td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-900 dark:text-kick-text">{row.message_id}</td>
                    <td className="px-4 py-3">
                      {tab === 'sweet_coins' ? (
                        <div className="space-y-0.5">
                          <div className="font-medium text-gray-900 dark:text-kick-text">{row.username || 'Unknown'}</div>
                          <div className="text-xs text-gray-500 dark:text-kick-text-secondary">Kick ID: {row.kick_user_id}</div>
                        </div>
                      ) : (
                        <div className="space-y-0.5">
                          <div className="font-medium text-gray-900 dark:text-kick-text">
                            {(row.sender_username || row.sender_user_id) + ' → ' + (row.broadcaster_username || row.broadcaster_user_id)}
                          </div>
                          {row.content_preview && (
                            <div className="text-xs text-gray-500 dark:text-kick-text-secondary truncate max-w-[520px]">
                              {row.content_preview}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-gray-900 dark:text-kick-text">{row.attempts}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-kick-text-secondary">{formatTime(row.created_at)}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-kick-text-secondary">{formatTime(row.locked_at)}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-kick-text-secondary">{formatTime(row.processed_at)}</td>
                    <td className="px-4 py-3">
                      {row.last_error ? (
                        <span className="text-xs text-red-600 dark:text-red-400 truncate block max-w-[240px]" title={row.last_error}>
                          {row.last_error}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400 dark:text-kick-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openDrawer(row)}
                        className="px-3 py-1.5 rounded-lg bg-kick-purple text-white hover:bg-kick-purple-dark transition-colors text-xs font-semibold"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-gray-600 dark:text-kick-text-secondary">
            {activeTotal.toLocaleString()} total • Showing {activeRows.length === 0 ? 0 : offset + 1}-{Math.min(offset + limit, activeTotal)}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setOffset(Math.max(0, offset - limit))}
              disabled={offset === 0}
              className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-kick-surface-hover text-gray-700 dark:text-kick-text hover:bg-gray-200 dark:hover:bg-kick-surface transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => setOffset(offset + limit)}
              disabled={offset + limit >= activeTotal}
              className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-kick-surface-hover text-gray-700 dark:text-kick-text hover:bg-gray-200 dark:hover:bg-kick-surface transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/70" onClick={() => setDrawerOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-white dark:bg-kick-surface border-l border-gray-200 dark:border-kick-border shadow-xl">
            <div className="p-4 border-b border-gray-200 dark:border-kick-border flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-900 dark:text-kick-text">{drawerTitle}</div>
                <div className="text-xs text-gray-500 dark:text-kick-text-secondary">Full job detail (payload/badges/emotes/errors)</div>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-kick-text-secondary dark:hover:text-kick-text"
                aria-label="Close"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 h-[calc(100%-57px)] overflow-auto">
              {drawerLoading ? (
                <div className="text-sm text-gray-600 dark:text-kick-text-secondary">Loading…</div>
              ) : (
                <pre className="text-xs leading-relaxed bg-gray-50 dark:bg-kick-dark border border-gray-200 dark:border-kick-border rounded-lg p-4 overflow-auto">
                  {JSON.stringify(drawerJson, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
