'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { getAccessToken } from '@/lib/cookies'

type RecentPurchase = {
  id: string
  type: string
  quantity: number
  sweet_coins_spent: number
  item_name: string
  created_at: string
}


export default function MyActivityPage() {
  const [kickUserId, setKickUserId] = useState<number | null>(null)
  const [kickUsername, setKickUsername] = useState<string | null>(null)
  const [points, setPoints] = useState<number | null>(null)
  const [purchases, setPurchases] = useState<RecentPurchase[]>([])
  const [accounts, setAccounts] = useState<Array<{ provider: string; connected: boolean; username?: string }>>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true)
        setError(null)

        const token = getAccessToken()
        if (!token) {
          setError('Unauthorized')
          return
        }

        const userRes = await fetch(`/api/user?access_token=${encodeURIComponent(token)}`, { cache: 'no-store' })
        if (!userRes.ok) throw new Error('Failed to load user')
        const user = await userRes.json()
        if (!user?.id) throw new Error('Missing user id')
        setKickUserId(user.id)
        setKickUsername(user.username || user.name || null)

        const [pointsRes, purchasesRes, accountsRes] = await Promise.all([
          fetch(`/api/sweet-coins?kick_user_id=${encodeURIComponent(String(user.id))}`),
          fetch(`/api/purchases/recent?limit=25`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`/api/connected-accounts?kick_user_id=${encodeURIComponent(String(user.id))}`),
        ])

        if (pointsRes.ok) {
          const data = await pointsRes.json()
          setPoints(typeof data?.total_sweet_coins === 'number' ? data.total_sweet_coins : 0)
        }

        if (purchasesRes.ok) {
          const data = await purchasesRes.json()
          const rows: RecentPurchase[] = Array.isArray(data?.purchases)
            ? data.purchases.map((p: any) => ({
                id: String(p.id),
                type: String(p.type),
                quantity: Number(p.quantity) || 0,
                sweet_coins_spent: Number(p.sweet_coins_spent) || 0,
                item_name: String(p.item_name || 'Item'),
                created_at: String(p.created_at),
              }))
            : []
          setPurchases(rows)
        }

        if (accountsRes.ok) {
          const data = await accountsRes.json()
          const accs = Array.isArray(data?.accounts)
            ? data.accounts.map((a: any) => ({
                provider: String(a.provider),
                connected: Boolean(a.connected),
                username: a.username ? String(a.username) : undefined,
              }))
            : []
          setAccounts(accs)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load activity')
      } finally {
        setLoading(false)
      }
    }

    run()
  }, [])


  const purchasePreviewLines = useMemo(() => {
    const byItem = new Map<string, { item: string; qty: number; points: number; tx: number; latest: string }>()
    for (const p of purchases) {
      const key = `${p.type}:${p.item_name}`
      const prev = byItem.get(key)
      if (!prev) {
        byItem.set(key, { item: p.item_name, qty: p.quantity, points: p.sweet_coins_spent, tx: 1, latest: p.created_at })
      } else {
        prev.qty += p.quantity
        prev.points += p.sweet_coins_spent
        prev.tx += 1
        if (p.created_at > prev.latest) prev.latest = p.created_at
      }
    }

    const grouped = [...byItem.values()].sort((a, b) => (a.latest < b.latest ? 1 : -1))
    return grouped.slice(0, 3).map(g => {
      const unit = g.qty === 1 ? 'ticket' : 'tickets'
      if (g.tx > 1) {
        return `You purchased ${g.qty} ${unit} for ${g.item} (${g.tx} transactions)`
      }
      return `${g.item} – ${g.qty} ${unit} (${g.points.toLocaleString()} Sweet Coins)`
    })
  }, [purchases])

  return (
    <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-h2 font-semibold text-gray-900 dark:text-kick-text">My Activity</h1>
          <p className="text-body text-gray-600 dark:text-kick-text-secondary">
            Your personal dashboard across Sweet Coins, achievements, purchases, and connected accounts.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-800 dark:text-red-200">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Your Sweet Coins */}
          <div className="rounded-xl border border-gray-200 dark:border-kick-border bg-white dark:bg-kick-surface p-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-kick-surface-hover flex items-center justify-center">
                <Image src="/icons/Sweetflipscoin.png" alt="" width={48} height={48} className="w-12 h-12" />
              </div>
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-kick-text">Your Sweet Coins</div>
                <div className="text-h3 font-semibold text-gray-900 dark:text-kick-text tabular-nums">
                  {loading ? '…' : (points ?? 0).toLocaleString()}
                </div>
              </div>
            </div>
            <div className="mt-3 text-sm text-gray-600 dark:text-kick-text-secondary">
              Earn Sweet Coins by chatting on stream or completing quests.
            </div>
          </div>

          {/* Your Achievements */}
          <div className="rounded-xl border border-gray-200 dark:border-kick-border bg-white dark:bg-kick-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-kick-text">Your Achievements</div>
                <div className="text-xs text-gray-600 dark:text-kick-text-secondary">
                  Track your progress and earn rewards
                </div>
              </div>
              <Link
                href="/achievements"
                className="text-sm font-medium text-kick-purple hover:text-kick-purple-dark"
              >
                View Achievements
              </Link>
            </div>

            <div className="mt-4 space-y-2">
              <div className="text-sm text-gray-600 dark:text-kick-text-secondary">
                Complete challenges to earn Sweet Coins. Check your achievements page for details!
              </div>
            </div>
          </div>

          {/* Your Purchases */}
          <div className="rounded-xl border border-gray-200 dark:border-kick-border bg-white dark:bg-kick-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-kick-text">Your Purchases</div>
                <div className="text-xs text-gray-600 dark:text-kick-text-secondary">
                  Recent activity
                </div>
              </div>
              <Link
                href="/activity/purchases"
                className="text-sm font-medium text-kick-purple hover:text-kick-purple-dark"
              >
                View Purchase History
              </Link>
            </div>

            <div className="mt-4 space-y-2">
              {loading ? (
                <div className="text-sm text-gray-600 dark:text-kick-text-secondary">Loading…</div>
              ) : purchasePreviewLines.length === 0 ? (
                <div className="text-sm text-gray-600 dark:text-kick-text-secondary">No purchases yet.</div>
              ) : (
                purchasePreviewLines.map((line, idx) => (
                  <div key={idx} className="text-sm text-gray-900 dark:text-kick-text">
                    {line}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Account Summary */}
          <div className="rounded-xl border border-gray-200 dark:border-kick-border bg-white dark:bg-kick-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-kick-text">Account Summary</div>
                <div className="text-xs text-gray-600 dark:text-kick-text-secondary">
                  Connectivity and profile status
                </div>
              </div>
              <Link
                href="/profile"
                className="text-sm font-medium text-kick-purple hover:text-kick-purple-dark"
              >
                Manage Connected Accounts
              </Link>
            </div>

            <div className="mt-4 space-y-3">
              <div className="text-sm text-gray-900 dark:text-kick-text">
                <span className="text-gray-600 dark:text-kick-text-secondary">Kick:</span>{' '}
                <span className="font-medium">{kickUsername || (kickUserId ? `User ${kickUserId}` : '—')}</span>
              </div>

              <div className="flex flex-wrap gap-2">
                {accounts.map(a => (
                  <div
                    key={a.provider}
                    className={`px-3 py-1 rounded-full text-xs border ${
                      a.connected
                        ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900/40 text-green-700 dark:text-green-200'
                        : 'bg-gray-50 dark:bg-kick-surface-hover border-gray-200 dark:border-kick-border text-gray-700 dark:text-kick-text-secondary'
                    }`}
                  >
                    {a.provider}: {a.connected ? 'Connected' : 'Not connected'}
                    {a.username ? ` (${a.username})` : ''}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
  )
}
