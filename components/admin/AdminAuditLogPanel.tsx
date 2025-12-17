'use client'

import { useEffect, useState } from 'react'

type Entry = {
  ts: number
  actor_username?: string
  actor_kick_user_id?: string
  action: string
  target: string
  summary?: string
}

function fmt(ts: number) {
  try {
    return new Date(ts).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
  } catch {
    return String(ts)
  }
}

export function AdminAuditLogPanel(props: { refreshKey?: number }) {
  const [loading, setLoading] = useState(true)
  const [clearing, setClearing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])

  async function load() {
    setError(null)
    try {
      const resp = await fetch('/api/admin/audit-log?limit=100', { method: 'GET' })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data?.error || 'Failed to load audit log')
      setEntries(Array.isArray(data?.entries) ? data.entries : [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.refreshKey])

  async function clear() {
    setClearing(true)
    setError(null)
    try {
      const resp = await fetch('/api/admin/audit-log', { method: 'DELETE' })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(data?.error || 'Failed to clear audit log')
      setEntries([])
    } catch (e: any) {
      setError(e?.message || 'Failed to clear')
    } finally {
      setClearing(false)
    }
  }

  return (
    <div className="p-4 rounded-xl border border-gray-200 dark:border-kick-border bg-white dark:bg-kick-surface space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-gray-900 dark:text-kick-text">Admin audit log</div>
          <div className="text-xs text-gray-500 dark:text-kick-text-secondary">Recent admin saves (stored in DB)</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="px-3 py-2 rounded-lg bg-gray-200 dark:bg-kick-bg-secondary text-gray-900 dark:text-kick-text"
          >
            Refresh
          </button>
          <button
            onClick={clear}
            disabled={clearing}
            className="px-3 py-2 rounded-lg bg-red-600 text-white disabled:opacity-60"
          >
            {clearing ? 'Clearing…' : 'Clear'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-kick-purple" />
        </div>
      ) : entries.length === 0 ? (
        <div className="text-sm text-gray-600 dark:text-kick-text-secondary">No entries yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-600 dark:text-kick-text-secondary">
                <th className="py-2 pr-3">Time</th>
                <th className="py-2 pr-3">Actor</th>
                <th className="py-2 pr-3">Target</th>
                <th className="py-2 pr-3">Summary</th>
              </tr>
            </thead>
            <tbody className="text-gray-900 dark:text-kick-text">
              {entries.map((e, idx) => (
                <tr key={`${e.ts}-${idx}`} className="border-t border-gray-200 dark:border-kick-border">
                  <td className="py-2 pr-3 font-mono text-xs text-gray-600 dark:text-kick-text-secondary">{fmt(e.ts)}</td>
                  <td className="py-2 pr-3">
                    {e.actor_username ? (
                      <span className="font-medium">{e.actor_username}</span>
                    ) : (
                      <span className="text-gray-600 dark:text-kick-text-secondary">unknown</span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <span className="font-mono text-xs">{e.target}</span>
                  </td>
                  <td className="py-2 pr-3 text-gray-700 dark:text-kick-text-secondary">{e.summary || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}


