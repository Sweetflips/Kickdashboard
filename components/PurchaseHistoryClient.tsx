'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getAccessToken } from '@/lib/cookies'

type Group = {
  key: string
  item: string
  type: string
  totalQuantity: number
  totalPointsSpent: number
  transactions: Array<{
    id: string
    created_at: string
    quantity: number
    points_spent: number
  }>
  transactionsCount: number
  lastPurchased: string
  status: string
}

function formatUtc(ts: string) {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ts
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
    timeZoneName: 'short',
  })
}

export default function PurchaseHistoryClient() {
  const router = useRouter()
  const sp = useSearchParams()

  const [type, setType] = useState(sp.get('type') || 'all')
  const [range, setRange] = useState(sp.get('range') || 'last7')
  const [search, setSearch] = useState(sp.get('search') || '')
  const [page, setPage] = useState<number>(parseInt(sp.get('page') || '1', 10) || 1)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [totalPages, setTotalPages] = useState(1)
  const [totalGroups, setTotalGroups] = useState(0)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  // Keep URL in sync
  useEffect(() => {
    const qp = new URLSearchParams()
    if (type && type !== 'all') qp.set('type', type)
    if (range && range !== 'last7') qp.set('range', range)
    if (search) qp.set('search', search)
    if (page !== 1) qp.set('page', String(page))
    const qs = qp.toString()
    router.replace(`/activity/purchases${qs ? `?${qs}` : ''}`)
  }, [type, range, search, page, router])

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true)
        setError(null)

        const token = getAccessToken()
        const qs = new URLSearchParams({
          type,
          range,
          search,
          page: String(page),
        })
        const res = await fetch(`/api/purchases/history?${qs.toString()}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          throw new Error(data?.error || "We couldn't load your purchase history. Please refresh the page or try again later.")
        }

        setGroups(Array.isArray(data?.groups) ? data.groups : [])
        setTotalPages(typeof data?.totalPages === 'number' ? data.totalPages : 1)
        setTotalGroups(typeof data?.totalGroups === 'number' ? data.totalGroups : 0)
      } catch (e) {
        setError(e instanceof Error ? e.message : "We couldn't load your purchase history. Please refresh the page or try again later.")
      } finally {
        setLoading(false)
      }
    }

    run()
  }, [type, range, search, page])

  const pages = useMemo(() => {
    const windowSize = 5
    const start = Math.max(1, page - Math.floor(windowSize / 2))
    const end = Math.min(totalPages, start + windowSize - 1)
    const out: number[] = []
    for (let i = start; i <= end; i++) out.push(i)
    return out
  }, [page, totalPages])

  return (
    <div>
      {/* Filters */}
      <div className="rounded-xl border border-gray-200 dark:border-kick-border bg-white dark:bg-kick-surface p-4 mb-4">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
          <div className="flex gap-3 flex-col sm:flex-row sm:items-center">
            <label className="text-sm text-gray-700 dark:text-kick-text-secondary">
              <span className="mr-2">Type</span>
              <select
                className="ml-0 sm:ml-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-kick-border bg-white dark:bg-kick-surface-hover text-sm"
                value={type}
                onChange={(e) => {
                  setPage(1)
                  setType(e.target.value)
                }}
              >
                <option value="all">All types</option>
                <option value="advent">Advent Calendar Tickets</option>
                <option value="raffle">Raffle Tickets</option>
                <option value="rewards" disabled>Rewards (future)</option>
                <option value="bundles" disabled>Bundles (future)</option>
              </select>
            </label>

            <label className="text-sm text-gray-700 dark:text-kick-text-secondary">
              <span className="mr-2">Date range</span>
              <select
                className="ml-0 sm:ml-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-kick-border bg-white dark:bg-kick-surface-hover text-sm"
                value={range}
                onChange={(e) => {
                  setPage(1)
                  setRange(e.target.value)
                }}
              >
                <option value="last7">Last 7 days</option>
                <option value="last30">Last 30 days</option>
                <option value="month">This month</option>
                <option value="year">This year</option>
                <option value="all">All time</option>
              </select>
            </label>
          </div>

          <div className="flex-1">
            <input
              value={search}
              onChange={(e) => {
                setPage(1)
                setSearch(e.target.value)
              }}
              placeholder="Search by item name…"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-kick-border bg-white dark:bg-kick-surface-hover text-sm"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-gray-200 dark:border-kick-border bg-white dark:bg-kick-surface overflow-hidden">
        <div className="hidden lg:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr] gap-3 px-4 py-3 border-b border-gray-200 dark:border-kick-border text-xs font-semibold text-gray-600 dark:text-kick-text-muted uppercase tracking-wider">
          <div>Item</div>
          <div>Type</div>
          <div>Total qty</div>
          <div>Total points</div>
          <div>Transactions</div>
          <div>Last purchased</div>
          <div>Status</div>
        </div>

        {loading ? (
          <div className="px-4 py-10 text-sm text-gray-600 dark:text-kick-text-secondary">Loading…</div>
        ) : groups.length === 0 ? (
          <div className="px-4 py-10">
            <div className="text-h4 font-semibold text-gray-900 dark:text-kick-text mb-1">No purchases found</div>
            <div className="text-sm text-gray-600 dark:text-kick-text-secondary mb-4">
              You haven’t purchased any items in this time range yet.
            </div>
            <Link
              href="/shop"
              className="inline-flex items-center px-4 py-2 rounded-lg bg-kick-purple text-white hover:bg-kick-purple-dark text-sm font-medium"
            >
              Go to Shop
            </Link>
          </div>
        ) : (
          <div>
            {groups.map((g) => {
              const isOpen = Boolean(expanded[g.key])
              return (
                <div key={g.key} className="border-b border-gray-200 dark:border-kick-border last:border-b-0">
                  <button
                    type="button"
                    onClick={() => setExpanded(prev => ({ ...prev, [g.key]: !prev[g.key] }))}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-kick-surface-hover"
                  >
                    <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr] gap-2 lg:gap-3 items-start">
                      <div className="text-sm font-medium text-gray-900 dark:text-kick-text">
                        {g.item}
                        <span className="ml-2 text-xs text-gray-500 dark:text-kick-text-muted">
                          {isOpen ? '▲' : '▼'}
                        </span>
                      </div>
                      <div className="text-sm text-gray-700 dark:text-kick-text-secondary">{g.type}</div>
                      <div className="text-sm text-gray-900 dark:text-kick-text tabular-nums">{g.totalQuantity.toLocaleString()}</div>
                      <div className="text-sm text-gray-900 dark:text-kick-text tabular-nums">{g.totalPointsSpent.toLocaleString()} Points</div>
                      <div className="text-sm text-gray-700 dark:text-kick-text-secondary tabular-nums">{g.transactionsCount}</div>
                      <div className="text-sm text-gray-700 dark:text-kick-text-secondary">{formatUtc(g.lastPurchased)}</div>
                      <div className="text-sm">
                        <span className="inline-flex px-2 py-1 rounded-full text-xs border border-gray-200 dark:border-kick-border bg-gray-50 dark:bg-kick-surface-hover text-gray-700 dark:text-kick-text-secondary">
                          {g.status}
                        </span>
                      </div>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4">
                      <div className="rounded-lg border border-gray-200 dark:border-kick-border overflow-hidden">
                        {g.transactions
                          .slice()
                          .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
                          .map((t) => (
                            <div key={t.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 px-3 py-2 border-b border-gray-200 dark:border-kick-border last:border-b-0">
                              <div className="text-sm text-gray-700 dark:text-kick-text-secondary">
                                {formatUtc(t.created_at)}
                              </div>
                              <div className="text-sm text-gray-900 dark:text-kick-text">
                                <span className="font-medium tabular-nums">{t.quantity}</span> ticket{t.quantity === 1 ? '' : 's'} ({t.points_spent.toLocaleString()} Points)
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {!loading && groups.length > 0 && (
        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-gray-600 dark:text-kick-text-secondary">
            {totalGroups.toLocaleString()} grouped items
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-kick-border bg-white dark:bg-kick-surface-hover text-sm disabled:opacity-50"
            >
              &lt; Previous
            </button>

            {pages.map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setPage(p)}
                className={`w-9 h-9 rounded-lg border text-sm ${
                  p === page
                    ? 'border-kick-purple bg-kick-purple text-white'
                    : 'border-gray-200 dark:border-kick-border bg-white dark:bg-kick-surface-hover text-gray-900 dark:text-kick-text'
                }`}
              >
                {p}
              </button>
            ))}

            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-kick-border bg-white dark:bg-kick-surface-hover text-sm disabled:opacity-50"
            >
              Next &gt;
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
