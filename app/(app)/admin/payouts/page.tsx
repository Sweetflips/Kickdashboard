'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getAccessToken } from '@/lib/cookies'

interface StreamSession {
    id: string
    session_title: string | null
    channel_slug: string
    started_at: string
    ended_at: string | null
    total_messages: number
    peak_viewer_count: number
    duration_formatted: string | null
    broadcaster: {
        username: string
        profile_picture_url: string | null
    }
}

interface PayoutEntry {
    rank: number
    user_id: string
    kick_user_id: string
    username: string
    telegram_username: string | null
    profile_picture_url: string | null
    points: number
    multiplier: number
    weighted_points: number
    payout: number
    percentage: number
}

interface PayoutSummary {
    total_points: number
    total_weighted_points: number
    dollar_per_point: number
    dollar_per_weighted_point: number
    total_payout: number
    budget: number
    participant_count: number
    total_participants: number
    top_n: number | null
    rank_bonus: boolean
    rounding_difference: number
}

interface PayoutData {
    stream_session: {
        id: string
        session_title: string | null
        channel_slug: string
        started_at: string
        ended_at: string | null
        total_messages: number
        peak_viewer_count: number
        broadcaster: {
            username: string
            profile_picture_url: string | null
        }
    }
    payouts: PayoutEntry[]
    summary: PayoutSummary
}

export default function PayoutsPage() {
    const router = useRouter()
    const [canViewPayouts, setCanViewPayouts] = useState(false)
    const [isAdmin, setIsAdmin] = useState(false)
    const [loading, setLoading] = useState(true)
    const [sessions, setSessions] = useState<StreamSession[]>([])
    const [sessionsLoading, setSessionsLoading] = useState(true)
    const [selectedSessionId, setSelectedSessionId] = useState<string>('')
    const [budget, setBudget] = useState<string>('100')
    const [roundTo, setRoundTo] = useState<number>(2)
    const [topN, setTopN] = useState<string>('') // empty = all participants
    const [rankBonus, setRankBonus] = useState<boolean>(true) // Enable rank multipliers by default
    const [payoutData, setPayoutData] = useState<PayoutData | null>(null)
    const [payoutLoading, setPayoutLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [imageErrors, setImageErrors] = useState<Set<string>>(new Set())
    const [overlayKey, setOverlayKey] = useState<string | null>(null)
    const [overlayKeyLoading, setOverlayKeyLoading] = useState(false)
    const [showOverlayKey, setShowOverlayKey] = useState(false)

    // Verify access (admin or moderator)
    useEffect(() => {
        const token = getAccessToken()
        if (!token) {
            router.push('/')
            return
        }

        fetch('/api/admin/verify', {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        })
            .then(res => res.json())
            .then(data => {
                if (!data.can_view_payouts) {
                    router.push('/')
                    return
                }
                setCanViewPayouts(true)
                setIsAdmin(data.is_admin === true)
                setLoading(false)
            })
            .catch(() => router.push('/'))
    }, [router])

    // Fetch overlay key (admin only)
    useEffect(() => {
        if (!canViewPayouts || !isAdmin) return

        const fetchOverlayKey = async () => {
            try {
                setOverlayKeyLoading(true)
                const token = getAccessToken()
                if (!token) return

                const response = await fetch('/api/admin/overlay-key', {
                    headers: { 'Authorization': `Bearer ${token}` },
                })
                if (response.ok) {
                    const data = await response.json()
                    setOverlayKey(data?.key || null)
                } else {
                    setOverlayKey(null)
                }
            } catch {
                setOverlayKey(null)
            } finally {
                setOverlayKeyLoading(false)
            }
        }

        fetchOverlayKey()
    }, [canViewPayouts, isAdmin])

    // Fetch stream sessions
    useEffect(() => {
        if (!canViewPayouts) return

        const fetchSessions = async () => {
            try {
                setSessionsLoading(true)
                const token = getAccessToken()
                if (!token) return

                const response = await fetch('/api/stream-sessions?limit=100', {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                    },
                })

                if (response.ok) {
                    const data = await response.json()
                    setSessions(data.sessions || [])
                }
            } catch (err) {
                console.error('Error fetching sessions:', err)
            } finally {
                setSessionsLoading(false)
            }
        }

        fetchSessions()
    }, [canViewPayouts])

    // Calculate payouts when session or parameters change
    const calculatePayouts = useCallback(async () => {
        if (!selectedSessionId || !budget) {
            setPayoutData(null)
            return
        }

        const budgetNum = parseFloat(budget)
        if (isNaN(budgetNum) || budgetNum <= 0) {
            setError('Please enter a valid budget amount')
            return
        }

        try {
            setPayoutLoading(true)
            setError(null)

            const token = getAccessToken()
            if (!token) return

            let url = `/api/admin/payouts?stream_session_id=${selectedSessionId}&budget=${budgetNum}&round_to=${roundTo}`

            // Add top_n parameter if specified
            const topNNum = topN ? parseInt(topN) : null
            if (topNNum && topNNum > 0) {
                url += `&top_n=${topNNum}`
            }

            // Add rank bonus parameter
            if (rankBonus) {
                url += `&rank_bonus=true`
            }

            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            })

            if (!response.ok) {
                const errData = await response.json()
                throw new Error(errData.error || 'Failed to calculate payouts')
            }

            const data = await response.json()
            setPayoutData(data)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error')
            setPayoutData(null)
        } finally {
            setPayoutLoading(false)
        }
    }, [selectedSessionId, budget, roundTo, topN, rankBonus])

    // Auto-calculate when parameters change
    useEffect(() => {
        if (selectedSessionId && budget) {
            const timer = setTimeout(() => {
                calculatePayouts()
            }, 300)
            return () => clearTimeout(timer)
        }
    }, [selectedSessionId, budget, roundTo, topN, rankBonus, calculatePayouts])

    // Export to CSV
    const exportToCSV = () => {
        if (!payoutData || payoutData.payouts.length === 0) return

        const headers = payoutData.summary.rank_bonus
            ? ['Rank', 'Username', 'Telegram', 'Points', 'Bonus', 'Weighted Points', 'Payout ($)', 'Percentage (%)']
            : ['Rank', 'Username', 'Telegram', 'Points', 'Payout ($)', 'Percentage (%)']

        const rows = payoutData.payouts.map(p => {
            const telegramDisplay = p.telegram_username ? `@${p.telegram_username}` : ''
            if (payoutData.summary.rank_bonus) {
                return [
                    p.rank.toString(),
                    p.username,
                    telegramDisplay,
                    (p.points ?? 0).toString(),
                    (p.multiplier ?? 1) > 1 ? `+${(((p.multiplier ?? 1) - 1) * 100).toFixed(0)}%` : '-',
                    (p.weighted_points ?? 0).toFixed(2),
                    (p.payout ?? 0).toFixed(roundTo),
                    (p.percentage ?? 0).toFixed(2),
                ]
            }
            return [
                p.rank.toString(),
                p.username,
                telegramDisplay,
                (p.points ?? 0).toString(),
                (p.payout ?? 0).toFixed(roundTo),
                (p.percentage ?? 0).toFixed(2),
            ]
        })

        // Add summary rows
        rows.push([])
        rows.push(['Summary'])
        rows.push(['Total Points', (payoutData.summary.total_points ?? 0).toString()])
        if (payoutData.summary.rank_bonus) {
            rows.push(['Total Weighted Points', (payoutData.summary.total_weighted_points ?? 0).toString()])
            rows.push(['Rank Bonus', 'Enabled (1st +50%, 2nd +30%, 3rd +15%, 4th +8%, 5th +4%)'])
        }
        rows.push(['Dollar per Point', `$${(payoutData.summary.dollar_per_point ?? 0).toFixed(6)}`])
        rows.push(['Total Payout', `$${(payoutData.summary.total_payout ?? 0).toFixed(roundTo)}`])
        rows.push(['Budget', `$${(payoutData.summary.budget ?? 0).toFixed(2)}`])
        rows.push(['Recipients', (payoutData.summary.participant_count ?? 0).toString()])
        rows.push(['Total Participants', (payoutData.summary.total_participants ?? 0).toString()])
        if (payoutData.summary.top_n) {
            rows.push(['Rank Filter', `Rank 1-${payoutData.summary.top_n}`])
        }
        if (payoutData.summary.rounding_difference !== 0) {
            rows.push(['Rounding Difference', `$${(payoutData.summary.rounding_difference ?? 0).toFixed(roundTo)}`])
        }

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(',')),
        ].join('\n')

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        const url = URL.createObjectURL(blob)
        link.setAttribute('href', url)

        const sessionTitle = payoutData.stream_session.session_title || payoutData.stream_session.channel_slug
        const date = new Date(payoutData.stream_session.started_at).toISOString().split('T')[0]
        link.setAttribute('download', `payouts-${sessionTitle}-${date}.csv`)

        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
    }

    const getRankIcon = (rank: number) => {
        if (rank === 1) return '🥇'
        if (rank === 2) return '🥈'
        if (rank === 3) return '🥉'
        return `#${rank}`
    }

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr)
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })
    }

    if (loading || !canViewPayouts) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kick-purple"></div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-kick-text">Payout Calculator</h1>
                </div>

                {/* OBS Overlay Access Key (Admin only) */}
                {isAdmin && (
                    <div className="bg-white dark:bg-kick-surface rounded-lg shadow-sm border border-gray-200 dark:border-kick-border p-6">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-kick-text mb-4">OBS Overlay Access Key</h2>

                        <div className="space-y-4">
                            <div>
                                <p className="text-sm font-medium text-gray-700 dark:text-kick-text-secondary mb-2">Overlay Key</p>
                                <div className="flex items-center gap-2">
                                    <code className="flex-1 px-4 py-2 bg-gray-100 dark:bg-kick-surface-hover rounded-lg text-sm font-mono text-gray-900 dark:text-kick-text border border-gray-200 dark:border-kick-border">
                                        {overlayKeyLoading ? (
                                            <span className="text-gray-500 dark:text-kick-text-muted">Loading...</span>
                                        ) : showOverlayKey && overlayKey ? (
                                            overlayKey
                                        ) : overlayKey ? (
                                            '•'.repeat(64)
                                        ) : (
                                            <span className="text-gray-500 dark:text-kick-text-muted">Not available</span>
                                        )}
                                    </code>
                                    {overlayKey && (
                                        <>
                                            <button
                                                onClick={() => setShowOverlayKey(!showOverlayKey)}
                                                className="px-4 py-2 bg-gray-200 dark:bg-kick-surface-hover text-gray-900 dark:text-kick-text rounded-lg hover:bg-gray-300 dark:hover:bg-kick-border transition-colors text-sm font-medium"
                                            >
                                                {showOverlayKey ? 'Hide' : 'Show'}
                                            </button>
                                            <button
                                                onClick={() => {
                                                    navigator.clipboard.writeText(overlayKey)
                                                }}
                                                className="px-4 py-2 bg-kick-purple text-white rounded-lg hover:bg-kick-purple/90 transition-colors text-sm font-medium"
                                            >
                                                Copy
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>

                            {overlayKey && (
                                <div>
                                    <p className="text-sm font-medium text-gray-700 dark:text-kick-text-secondary mb-2">Example OBS Browser Source URLs</p>
                                    <div className="space-y-2">
                                        <div>
                                            <p className="text-xs text-gray-500 dark:text-kick-text-muted mb-1">Per-raffle overlay:</p>
                                            <code className="block px-4 py-2 bg-gray-100 dark:bg-kick-surface-hover rounded-lg text-xs font-mono text-gray-900 dark:text-kick-text border border-gray-200 dark:border-kick-border break-all">
                                                {typeof window !== 'undefined' ? `${window.location.origin}/raffles/&lt;raffleId&gt;/wheel?overlay=1&key=${overlayKey}` : '...'}
                                            </code>
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-500 dark:text-kick-text-muted mb-1">Global wheel overlay:</p>
                                            <code className="block px-4 py-2 bg-gray-100 dark:bg-kick-surface-hover rounded-lg text-xs font-mono text-gray-900 dark:text-kick-text border border-gray-200 dark:border-kick-border break-all">
                                                {typeof window !== 'undefined' ? `${window.location.origin}/wheel?key=${overlayKey}` : '...'}
                                            </code>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Controls */}
                <div className="bg-white dark:bg-kick-surface rounded-lg shadow-sm border border-gray-200 dark:border-kick-border p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* Stream Session Selector */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-kick-text-secondary mb-2">
                                Stream Session
                            </label>
                            {sessionsLoading ? (
                                <div className="h-10 bg-gray-100 dark:bg-kick-surface-hover rounded-lg animate-pulse"></div>
                            ) : (
                                <select
                                    value={selectedSessionId}
                                    onChange={(e) => setSelectedSessionId(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-surface text-gray-900 dark:text-kick-text focus:outline-none focus:ring-2 focus:ring-kick-purple"
                                >
                                    <option value="">Select a stream...</option>
                                    {sessions.map((session) => (
                                        <option key={session.id} value={session.id}>
                                            {session.session_title || session.channel_slug} — {formatDate(session.started_at)}
                                            {session.duration_formatted ? ` (${session.duration_formatted})` : ''}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>

                        {/* Budget Input */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-kick-text-secondary mb-2">
                                Budget ($)
                            </label>
                            <input
                                type="number"
                                value={budget}
                                onChange={(e) => setBudget(e.target.value)}
                                min="0"
                                step="0.01"
                                placeholder="100"
                                className="w-full px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-surface text-gray-900 dark:text-kick-text focus:outline-none focus:ring-2 focus:ring-kick-purple"
                            />
                        </div>

                        {/* Top N Selector */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-kick-text-secondary mb-2">
                                Recipients
                            </label>
                            <div className="flex gap-2">
                                <select
                                    value={topN}
                                    onChange={(e) => setTopN(e.target.value)}
                                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-surface text-gray-900 dark:text-kick-text focus:outline-none focus:ring-2 focus:ring-kick-purple"
                                >
                                    <option value="">All Participants</option>
                                    <option value="1">Rank #1 only</option>
                                    <option value="3">Rank 1-3</option>
                                    <option value="5">Rank 1-5</option>
                                    <option value="10">Rank 1-10</option>
                                    <option value="15">Rank 1-15</option>
                                    <option value="20">Rank 1-20</option>
                                    <option value="25">Rank 1-25</option>
                                    <option value="50">Rank 1-50</option>
                                </select>
                                <input
                                    type="number"
                                    value={topN}
                                    onChange={(e) => setTopN(e.target.value)}
                                    min="1"
                                    placeholder="#"
                                    className="w-20 px-3 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-surface text-gray-900 dark:text-kick-text focus:outline-none focus:ring-2 focus:ring-kick-purple text-center"
                                    title="Custom number"
                                />
                            </div>
                        </div>

                        {/* Rounding Toggle */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-kick-text-secondary mb-2">
                                Rounding
                            </label>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setRoundTo(2)}
                                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                        roundTo === 2
                                            ? 'bg-kick-purple text-white'
                                            : 'bg-gray-100 dark:bg-kick-surface-hover text-gray-700 dark:text-kick-text hover:bg-gray-200 dark:hover:bg-kick-dark'
                                    }`}
                                >
                                    2 Decimals
                                </button>
                                <button
                                    onClick={() => setRoundTo(0)}
                                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                        roundTo === 0
                                            ? 'bg-kick-purple text-white'
                                            : 'bg-gray-100 dark:bg-kick-surface-hover text-gray-700 dark:text-kick-text hover:bg-gray-200 dark:hover:bg-kick-dark'
                                    }`}
                                >
                                    Whole $
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Rank Bonus Toggle */}
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-kick-border">
                        <div className="flex items-center justify-between">
                            <div>
                                <label className="text-sm font-medium text-gray-700 dark:text-kick-text-secondary">
                                    Rank Bonus
                                </label>
                                <p className="text-xs text-gray-500 dark:text-kick-text-muted mt-0.5">
                                    Higher ranks get multipliers: 1st +100%, 2nd +75%, 3rd +50% (rest even)
                                </p>
                            </div>
                            <button
                                onClick={() => setRankBonus(!rankBonus)}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                    rankBonus ? 'bg-kick-green' : 'bg-gray-300 dark:bg-kick-surface-hover'
                                }`}
                            >
                                <span
                                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                        rankBonus ? 'translate-x-6' : 'translate-x-1'
                                    }`}
                                />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Error */}
                {error && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                        <p className="text-red-800 dark:text-red-200">{error}</p>
                    </div>
                )}

                {/* Loading */}
                {payoutLoading && (
                    <div className="flex items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kick-purple"></div>
                    </div>
                )}

                {/* Results */}
                {payoutData && !payoutLoading && (
                    <>
                        {/* Summary Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            <div className="bg-white dark:bg-kick-surface rounded-lg shadow-sm border border-gray-200 dark:border-kick-border p-4">
                                <div className="text-sm text-gray-600 dark:text-kick-text-secondary">Total Points</div>
                                <div className="text-2xl font-bold text-gray-900 dark:text-kick-text">
                                    {(payoutData.summary.total_points ?? 0).toLocaleString()}
                                </div>
                            </div>
                            <div className="bg-white dark:bg-kick-surface rounded-lg shadow-sm border border-gray-200 dark:border-kick-border p-4">
                                <div className="text-sm text-gray-600 dark:text-kick-text-secondary">$/Point</div>
                                <div className="text-2xl font-bold text-kick-green">
                                    ${(payoutData.summary.dollar_per_point ?? 0).toFixed(4)}
                                </div>
                            </div>
                            <div className="bg-white dark:bg-kick-surface rounded-lg shadow-sm border border-gray-200 dark:border-kick-border p-4">
                                <div className="text-sm text-gray-600 dark:text-kick-text-secondary">Total Payout</div>
                                <div className="text-2xl font-bold text-kick-purple">
                                    ${(payoutData.summary.total_payout ?? 0).toFixed(roundTo)}
                                </div>
                            </div>
                            <div className="bg-white dark:bg-kick-surface rounded-lg shadow-sm border border-gray-200 dark:border-kick-border p-4">
                                <div className="text-sm text-gray-600 dark:text-kick-text-secondary">Recipients</div>
                                <div className="text-2xl font-bold text-gray-900 dark:text-kick-text">
                                    {payoutData.summary.participant_count}
                                    {payoutData.summary.top_n && payoutData.summary.total_participants > payoutData.summary.participant_count && (
                                        <span className="text-sm font-normal text-gray-500 dark:text-kick-text-muted ml-1">
                                            of {payoutData.summary.total_participants}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="bg-white dark:bg-kick-surface rounded-lg shadow-sm border border-gray-200 dark:border-kick-border p-4">
                                <div className="text-sm text-gray-600 dark:text-kick-text-secondary">Budget</div>
                                <div className="text-2xl font-bold text-gray-900 dark:text-kick-text">
                                    ${(payoutData.summary.budget ?? 0).toFixed(2)}
                                </div>
                            </div>
                        </div>

                        {/* Export Button */}
                        <div className="flex justify-end">
                            <button
                                onClick={exportToCSV}
                                disabled={payoutData.payouts.length === 0}
                                className="px-4 py-2 bg-kick-green text-white rounded-lg font-medium hover:bg-kick-green/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Export CSV
                            </button>
                        </div>

                        {/* Payouts Table */}
                        {payoutData.payouts.length === 0 ? (
                            <div className="bg-white dark:bg-kick-surface rounded-lg shadow-sm border border-gray-200 dark:border-kick-border p-12 text-center">
                                <p className="text-gray-600 dark:text-kick-text-secondary">
                                    No points were earned during this stream session.
                                </p>
                            </div>
                        ) : (
                            <div className="bg-white dark:bg-kick-surface rounded-lg shadow-sm border border-gray-200 dark:border-kick-border overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b border-gray-200 dark:border-kick-border bg-gray-50 dark:bg-kick-dark">
                                                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-kick-text-secondary">Rank</th>
                                                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-kick-text-secondary">User</th>
                                                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-kick-text-secondary">Points</th>
                                                {payoutData.summary.rank_bonus && (
                                                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-kick-text-secondary">Bonus</th>
                                                )}
                                                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-kick-text-secondary">Payout</th>
                                                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-kick-text-secondary">% of Pot</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {payoutData.payouts.map((entry) => (
                                                <tr
                                                    key={entry.user_id}
                                                    className="border-b border-gray-100 dark:border-kick-border hover:bg-gray-50 dark:hover:bg-kick-dark transition-colors"
                                                >
                                                    <td className="py-4 px-4">
                                                        <span className="text-lg font-semibold text-gray-900 dark:text-kick-text">
                                                            {getRankIcon(entry.rank)}
                                                        </span>
                                                    </td>
                                                    <td className="py-4 px-4">
                                                        <div className="flex items-center gap-3">
                                                            {entry.profile_picture_url && !imageErrors.has(entry.user_id) ? (
                                                                <img
                                                                    src={entry.profile_picture_url}
                                                                    alt={entry.username}
                                                                    width={40}
                                                                    height={40}
                                                                    className="w-10 h-10 rounded-full object-cover"
                                                                    onError={() => {
                                                                        setImageErrors(prev => new Set(prev).add(entry.user_id))
                                                                    }}
                                                                />
                                                            ) : (
                                                                <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-kick-surface-hover flex items-center justify-center">
                                                                    <span className="text-gray-600 dark:text-kick-text-secondary text-sm font-medium">
                                                                        {entry.username.charAt(0).toUpperCase()}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            <span className="font-medium text-gray-900 dark:text-kick-text">
                                                                {entry.telegram_username
                                                                    ? `${entry.username} — @${entry.telegram_username}`
                                                                    : entry.username}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="py-4 px-4 text-right">
                                                        <span className="font-semibold text-kick-purple">
                                                            {(entry.points ?? 0).toLocaleString()}
                                                        </span>
                                                    </td>
                                                    {payoutData.summary.rank_bonus && (
                                                        <td className="py-4 px-4 text-right">
                                                            {(entry.multiplier ?? 1) > 1 ? (
                                                                <span className="px-2 py-1 rounded-full text-xs font-semibold bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200">
                                                                    +{(((entry.multiplier ?? 1) - 1) * 100).toFixed(0)}%
                                                                </span>
                                                            ) : (
                                                                <span className="text-gray-400 dark:text-kick-text-muted text-sm">—</span>
                                                            )}
                                                        </td>
                                                    )}
                                                    <td className="py-4 px-4 text-right">
                                                        <span className="font-bold text-kick-green text-lg">
                                                            ${(entry.payout ?? 0).toFixed(roundTo)}
                                                        </span>
                                                    </td>
                                                    <td className="py-4 px-4 text-right">
                                                        <span className="text-gray-600 dark:text-kick-text-secondary">
                                                            {(entry.percentage ?? 0).toFixed(2)}%
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Rank Filter Info */}
                        {payoutData.summary.top_n && payoutData.summary.total_participants > payoutData.summary.participant_count && (
                            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                                <p className="text-blue-800 dark:text-blue-200 text-sm">
                                    <strong>Rank Filter (up to rank {payoutData.summary.top_n}):</strong> Showing {payoutData.summary.participant_count} recipients out of {payoutData.summary.total_participants} total participants. All users with the same points share the same rank. The ${(payoutData.summary.budget ?? 0).toFixed(2)} budget is split only among these ranks.
                                </p>
                            </div>
                        )}

                        {/* Rounding Notice */}
                        {payoutData.summary.rounding_difference !== 0 && (
                            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                                <p className="text-yellow-800 dark:text-yellow-200 text-sm">
                                    <strong>Note:</strong> Due to rounding, the total payout (${(payoutData.summary.total_payout ?? 0).toFixed(roundTo)}) differs from the budget (${(payoutData.summary.budget ?? 0).toFixed(2)}) by ${Math.abs(payoutData.summary.rounding_difference ?? 0).toFixed(roundTo)}.
                                </p>
                            </div>
                        )}
                    </>
                )}

                {/* No Selection State */}
                {!selectedSessionId && !payoutLoading && (
                    <div className="bg-white dark:bg-kick-surface rounded-lg shadow-sm border border-gray-200 dark:border-kick-border p-12 text-center">
                        <div className="text-6xl mb-4">💰</div>
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-2">
                            Select a Stream to Calculate Payouts
                        </h2>
                        <p className="text-gray-600 dark:text-kick-text-secondary">
                            Choose a stream session from the dropdown above and set your budget to see the payout breakdown.
                        </p>
                    </div>
                )}
            </div>
    )
}
