'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

interface LeaderboardEntry {
    rank: number
    user_id: string
    kick_user_id: string
    username: string
    profile_picture_url: string | null
    total_points: number
    total_emotes: number
    total_messages: number
    streams_watched: number
    last_point_earned_at: string | null
    is_verified?: boolean
    last_login_at?: string | null
    verification_methods?: {
        kick: boolean
        discord: boolean
        telegram: boolean
    }
}

type DateFilterMode = 'overall' | 'custom' | 'today' | 'last7days' | 'last30days' | 'last90days'

type SortBy = 'points' | 'messages' | 'streams' | 'emotes'

interface ViewerSummary {
    rank: number | null
    total_points: number
    total_emotes: number
    total_messages: number
    streams_watched: number
}

export default function LeaderboardPage() {
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [total, setTotal] = useState(0)
    const [offset, setOffset] = useState(0)
    const [imageErrors, setImageErrors] = useState<Set<string>>(new Set())
    const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>('last7days')
    const [startDate, setStartDate] = useState<string>('')
    const [endDate, setEndDate] = useState<string>('')
    const [sortBy, setSortBy] = useState<SortBy>('points')
    const [viewerKickUserId, setViewerKickUserId] = useState<string | null>(null)
    const [viewer, setViewer] = useState<ViewerSummary | null>(null)
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
    const limit = 50

    const getDateRange = useCallback((mode: DateFilterMode): { start: string; end: string } | null => {
        const today = new Date()
        today.setUTCHours(23, 59, 59, 999)

        switch (mode) {
            case 'today': {
                const start = new Date(today)
                start.setUTCHours(0, 0, 0, 0)
                return {
                    start: start.toISOString().split('T')[0],
                    end: today.toISOString().split('T')[0],
                }
            }
            case 'last7days': {
                const start = new Date(today)
                start.setUTCDate(start.getUTCDate() - 6)
                start.setUTCHours(0, 0, 0, 0)
                return {
                    start: start.toISOString().split('T')[0],
                    end: today.toISOString().split('T')[0],
                }
            }
            case 'last30days': {
                const start = new Date(today)
                start.setUTCDate(start.getUTCDate() - 29)
                start.setUTCHours(0, 0, 0, 0)
                return {
                    start: start.toISOString().split('T')[0],
                    end: today.toISOString().split('T')[0],
                }
            }
            case 'last90days': {
                const start = new Date(today)
                start.setUTCDate(start.getUTCDate() - 89)
                start.setUTCHours(0, 0, 0, 0)
                return {
                    start: start.toISOString().split('T')[0],
                    end: today.toISOString().split('T')[0],
                }
            }
            case 'custom':
                if (startDate && endDate) {
                    return { start: startDate, end: endDate }
                }
                return null
            default:
                return null
        }
    }, [startDate, endDate])

    // Fetch current user's Kick user id (for "Your position" bar)
    useEffect(() => {
        try {
            const token = localStorage.getItem('kick_access_token')
            if (!token) return

            fetch(`/api/user?access_token=${encodeURIComponent(token)}`)
                .then(res => (res.ok ? res.json() : null))
                .then((data) => {
                    if (data?.id) {
                        setViewerKickUserId(String(data.id))
                    }
                })
                .catch(() => {})
        } catch {
            // ignore
        }
    }, [])

    const fetchLeaderboard = useCallback(async (newOffset: number = 0) => {
        try {
            setLoading(true)
            setError(null)

            let url = `/api/leaderboard?limit=${limit}&offset=${newOffset}&sortBy=${encodeURIComponent(sortBy)}`

            const dateRange = getDateRange(dateFilterMode)
            if (dateRange) {
                url += `&startDate=${encodeURIComponent(dateRange.start)}&endDate=${encodeURIComponent(dateRange.end)}`
            }

            if (viewerKickUserId) {
                url += `&viewer_kick_user_id=${encodeURIComponent(viewerKickUserId)}`
            }

            const response = await fetch(url)
            if (!response.ok) {
                throw new Error('Failed to fetch leaderboard')
            }
            const data = await response.json()
            setLeaderboard(data.leaderboard)
            setTotal(data.total)
            setViewer(data.viewer ?? null)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error')
        } finally {
            setLoading(false)
        }
    }, [dateFilterMode, getDateRange, sortBy, viewerKickUserId])

    useEffect(() => {
        setOffset(0)
        fetchLeaderboard(0)
    }, [fetchLeaderboard])

    useEffect(() => {
        fetchLeaderboard(offset)
    }, [offset, fetchLeaderboard])

    // Auto-fetch when custom dates change (with debounce)
    useEffect(() => {
        if (dateFilterMode === 'custom') {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current)
            }

            if (startDate && endDate) {
                debounceTimerRef.current = setTimeout(() => {
                    setOffset(0)
                    fetchLeaderboard(0)
                }, 500)
            }

            return () => {
                if (debounceTimerRef.current) {
                    clearTimeout(debounceTimerRef.current)
                }
            }
        }
    }, [startDate, endDate, dateFilterMode, fetchLeaderboard])

    const handleDateFilterChange = (mode: DateFilterMode) => {
        setDateFilterMode(mode)
        if (mode === 'overall') {
            setStartDate('')
            setEndDate('')
        } else if (mode !== 'custom') {
            const today = new Date()
            today.setUTCHours(23, 59, 59, 999)
            const todayStr = today.toISOString().split('T')[0]

            let startDateStr = todayStr
            if (mode === 'today') {
                // Already set to today
            } else if (mode === 'last7days') {
                const start = new Date(today)
                start.setUTCDate(start.getUTCDate() - 6)
                start.setUTCHours(0, 0, 0, 0)
                startDateStr = start.toISOString().split('T')[0]
            } else if (mode === 'last30days') {
                const start = new Date(today)
                start.setUTCDate(start.getUTCDate() - 29)
                start.setUTCHours(0, 0, 0, 0)
                startDateStr = start.toISOString().split('T')[0]
            } else if (mode === 'last90days') {
                const start = new Date(today)
                start.setUTCDate(start.getUTCDate() - 89)
                start.setUTCHours(0, 0, 0, 0)
                startDateStr = start.toISOString().split('T')[0]
            }

            setStartDate(startDateStr)
            setEndDate(todayStr)
        }
    }

    const getRankIcon = (rank: number) => {
        if (rank === 1) return '🥇'
        if (rank === 2) return '🥈'
        if (rank === 3) return '🥉'
        return `#${rank}`
    }

    const rangeLabel = (() => {
        switch (dateFilterMode) {
            case 'today':
                return 'today'
            case 'last7days':
                return 'this week'
            case 'last30days':
                return 'in the last 30 days'
            case 'last90days':
                return 'in the last 90 days'
            case 'overall':
                return 'overall'
            case 'custom':
                return 'in this range'
            default:
                return 'in this range'
        }
    })()

    const yourPositionText = (() => {
        if (!viewerKickUserId) return 'Loading your position…'
        if (!viewer) return 'Loading your position…'
        if (typeof viewer.rank === 'number') {
            return `You are #${viewer.rank} ${rangeLabel} — keep chatting to climb!`
        }
        return `You are not ranked ${rangeLabel} yet — keep chatting to join the leaderboard!`
    })()

    return (
        <div className="space-y-6">
                <div className="bg-white dark:bg-kick-surface rounded-lg shadow-sm border border-gray-200 dark:border-kick-border p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                        <h1 className="text-h2 font-semibold text-gray-900 dark:text-kick-text">Leaderboard</h1>

                        {/* Date Filter */}
                        <div className="flex flex-col gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    onClick={() => handleDateFilterChange('overall')}
                                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                                        dateFilterMode === 'overall'
                                            ? 'bg-kick-purple text-white'
                                            : 'bg-gray-100 dark:bg-kick-surface-hover text-gray-700 dark:text-kick-text hover:bg-gray-200 dark:hover:bg-kick-surface-hover'
                                    }`}
                                >
                                    Overall
                                </button>
                                <button
                                    onClick={() => handleDateFilterChange('today')}
                                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                                        dateFilterMode === 'today'
                                            ? 'bg-kick-purple text-white'
                                            : 'bg-gray-100 dark:bg-kick-surface-hover text-gray-700 dark:text-kick-text hover:bg-gray-200 dark:hover:bg-kick-surface-hover'
                                    }`}
                                >
                                    Today
                                </button>
                                <button
                                    onClick={() => handleDateFilterChange('last7days')}
                                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                                        dateFilterMode === 'last7days'
                                            ? 'bg-kick-purple text-white'
                                            : 'bg-gray-100 dark:bg-kick-surface-hover text-gray-700 dark:text-kick-text hover:bg-gray-200 dark:hover:bg-kick-surface-hover'
                                    }`}
                                >
                                    This Week
                                </button>
                                <button
                                    onClick={() => handleDateFilterChange('last30days')}
                                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                                        dateFilterMode === 'last30days'
                                            ? 'bg-kick-purple text-white'
                                            : 'bg-gray-100 dark:bg-kick-surface-hover text-gray-700 dark:text-kick-text hover:bg-gray-200 dark:hover:bg-kick-surface-hover'
                                    }`}
                                >
                                    Last 30 Days
                                </button>
                                <button
                                    onClick={() => handleDateFilterChange('last90days')}
                                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                                        dateFilterMode === 'last90days'
                                            ? 'bg-kick-purple text-white'
                                            : 'bg-gray-100 dark:bg-kick-surface-hover text-gray-700 dark:text-kick-text hover:bg-gray-200 dark:hover:bg-kick-surface-hover'
                                    }`}
                                >
                                    Last 90 Days
                                </button>
                                <button
                                    onClick={() => handleDateFilterChange('custom')}
                                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                                        dateFilterMode === 'custom'
                                            ? 'bg-kick-purple text-white'
                                            : 'bg-gray-100 dark:bg-kick-surface-hover text-gray-700 dark:text-kick-text hover:bg-gray-200 dark:hover:bg-kick-surface-hover'
                                    }`}
                                >
                                    Custom Range
                                </button>
                            </div>

                            {/* Sorting */}
                            <div className="flex items-center justify-end gap-2">
                                <span className="text-sm font-medium text-gray-700 dark:text-kick-text-secondary">
                                    Sort by
                                </span>
                                <select
                                    value={sortBy}
                                    onChange={(e) => {
                                        setSortBy(e.target.value as SortBy)
                                        setOffset(0)
                                    }}
                                    className="px-3 py-1.5 text-sm border border-gray-300 dark:border-kick-border rounded-md bg-white dark:bg-kick-surface text-gray-900 dark:text-kick-text focus:outline-none focus:ring-2 focus:ring-kick-purple"
                                >
                                    <option value="points">Points</option>
                                    <option value="messages">Messages sent</option>
                                    <option value="streams">Streams watched</option>
                                    <option value="emotes">Emotes used</option>
                                </select>
                            </div>

                            {dateFilterMode === 'custom' && (
                                <div className="flex items-center gap-2">
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        max={endDate || undefined}
                                        className="px-3 py-1.5 text-sm border border-gray-300 dark:border-kick-border rounded-md bg-white dark:bg-kick-surface text-gray-900 dark:text-kick-text focus:outline-none focus:ring-2 focus:ring-kick-purple"
                                    />
                                    <span className="text-sm text-gray-600 dark:text-kick-text-secondary">to</span>
                                    <input
                                        type="date"
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                        min={startDate || undefined}
                                        className="px-3 py-1.5 text-sm border border-gray-300 dark:border-kick-border rounded-md bg-white dark:bg-kick-surface text-gray-900 dark:text-kick-text focus:outline-none focus:ring-2 focus:ring-kick-purple"
                                    />
                                    {startDate && endDate && startDate > endDate && (
                                        <span className="text-xs text-red-600 dark:text-red-400">Start date must be before end date</span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Your Position */}
                    <div className="sticky top-0 z-10 -mx-6 mb-4 px-6 py-3 bg-gray-50/95 dark:bg-kick-surface-hover/95 backdrop-blur border-y border-gray-200 dark:border-kick-border">
                        <p className="text-sm font-semibold text-gray-900 dark:text-kick-text">
                            {yourPositionText}
                        </p>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center h-64">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kick-purple"></div>
                        </div>
                    ) : error ? (
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                            <p className="text-red-800 dark:text-red-200">Error: {error}</p>
                        </div>
                    ) : leaderboard.length === 0 ? (
                        <div className="text-center py-12">
                            <p className="text-body text-gray-600 dark:text-kick-text-secondary">No users on the leaderboard yet.</p>
                        </div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-gray-200 dark:border-kick-border">
                                            <th className="text-left py-3 px-4 text-small font-semibold text-gray-600 dark:text-kick-text-secondary">Rank</th>
                                            <th className="text-left py-3 px-4 text-small font-semibold text-gray-600 dark:text-kick-text-secondary">User</th>
                                            <th className="text-right py-3 px-4 text-small font-semibold text-gray-600 dark:text-kick-text-secondary">Points</th>
                                            <th className="text-right py-3 px-4 text-small font-semibold text-gray-600 dark:text-kick-text-secondary">Emotes</th>
                                            <th className="text-right py-3 px-4 text-small font-semibold text-gray-600 dark:text-kick-text-secondary">Streams Watched</th>
                                            <th className="text-right py-3 px-4 text-small font-semibold text-gray-600 dark:text-kick-text-secondary">Messages Sent</th>
                                            <th className="text-left py-3 px-4 text-small font-semibold text-gray-600 dark:text-kick-text-secondary">Last Login</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {leaderboard.map((entry) => (
                                            <tr
                                                key={entry.user_id}
                                                className="border-b border-gray-200 dark:border-kick-border hover:bg-gray-50 dark:hover:bg-kick-surface-hover transition-colors"
                                            >
                                                <td className="py-4 px-4">
                                                    <span className="text-body font-semibold text-gray-900 dark:text-kick-text">
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
                                                                <span className="text-gray-600 dark:text-kick-text-secondary text-small font-medium">
                                                                    {entry.username.charAt(0).toUpperCase()}
                                                                </span>
                                                            </div>
                                                        )}
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-medium text-body text-gray-900 dark:text-kick-text">
                                                                {entry.username}
                                                            </span>
                                                            {entry.verification_methods && (
                                                                <div className="flex items-center gap-1">
                                                                    {entry.verification_methods.kick && (
                                                                        <img
                                                                            src="/logos/kick-icon.svg"
                                                                            alt="Kick verified"
                                                                            width={16}
                                                                            height={16}
                                                                            className="object-contain w-4 h-4"
                                                                            style={{ width: '16px', height: '16px' }}
                                                                            title="Verified via Kick login"
                                                                        />
                                                                    )}
                                                                    {entry.verification_methods.discord && (
                                                                        <img
                                                                            src="/icons/discord.png"
                                                                            alt="Discord connected"
                                                                            width="16"
                                                                            height="16"
                                                                            className="object-contain w-4 h-4"
                                                                            title="Connected via Discord"
                                                                            style={{ width: '21px', height: '21px' }}
                                                                        />
                                                                    )}
                                                                    {entry.verification_methods.telegram && (
                                                                        <img
                                                                            src="/logos/telegram-logo.png"
                                                                            alt="Telegram connected"
                                                                            width="18"
                                                                            height="18"
                                                                            className="object-contain"
                                                                            title="Connected via Telegram"
                                                                            style={{ width: '32px', height: '32px' }}
                                                                        />
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="py-4 px-4 text-right">
                                                    <span className="font-semibold text-body text-kick-purple">
                                                        {(entry.total_points || 0).toLocaleString()}
                                                    </span>
                                                </td>
                                                <td className="py-4 px-4 text-right">
                                                    <span className="font-semibold text-body text-kick-green">
                                                        {(entry.total_emotes || 0).toLocaleString()}
                                                    </span>
                                                </td>
                                                <td className="py-4 px-4 text-right">
                                                    <span className="text-body text-gray-900 dark:text-kick-text">
                                                        {(entry.streams_watched || 0).toLocaleString()}
                                                    </span>
                                                </td>
                                                <td className="py-4 px-4 text-right">
                                                    <span className="text-body text-gray-900 dark:text-kick-text">
                                                        {(entry.total_messages || 0).toLocaleString()}
                                                    </span>
                                                </td>
                                                <td className="py-4 px-4 text-small text-gray-600 dark:text-kick-text-secondary">
                                                    {entry.last_login_at
                                                        ? new Date(entry.last_login_at).toLocaleString()
                                                        : 'Never'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {total > limit && (
                                <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200 dark:border-kick-border">
                                    <button
                                        onClick={() => setOffset(Math.max(0, offset - limit))}
                                        disabled={offset === 0}
                                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-kick-surface-hover text-gray-900 dark:text-kick-text rounded-md hover:bg-gray-200 dark:hover:bg-kick-surface-hover disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium"
                                    >
                                        Previous
                                    </button>
                                    <span className="text-small text-gray-600 dark:text-kick-text-secondary">
                                        Showing {offset + 1}-{Math.min(offset + limit, total)} of {total}
                                    </span>
                                    <button
                                        onClick={() => setOffset(offset + limit)}
                                        disabled={offset + limit >= total}
                                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-kick-surface-hover text-gray-900 dark:text-kick-text rounded-md hover:bg-gray-200 dark:hover:bg-kick-surface-hover disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium"
                                    >
                                        Next
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
    )
}
