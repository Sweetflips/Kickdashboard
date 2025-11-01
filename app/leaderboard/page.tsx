'use client'

import { useEffect, useState } from 'react'
import AppLayout from '../../components/AppLayout'

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

export default function LeaderboardPage() {
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [total, setTotal] = useState(0)
    const [offset, setOffset] = useState(0)
    const [imageErrors, setImageErrors] = useState<Set<string>>(new Set())
    const limit = 50

    useEffect(() => {
        fetchLeaderboard()
    }, [offset])

    const fetchLeaderboard = async () => {
        try {
            setLoading(true)
            setError(null)
            const response = await fetch(`/api/leaderboard?limit=${limit}&offset=${offset}`)
            if (!response.ok) {
                throw new Error('Failed to fetch leaderboard')
            }
            const data = await response.json()
            setLeaderboard(data.leaderboard)
            setTotal(data.total)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error')
        } finally {
            setLoading(false)
        }
    }

    const getRankIcon = (rank: number) => {
        if (rank === 1) return '🥇'
        if (rank === 2) return '🥈'
        if (rank === 3) return '🥉'
        return `#${rank}`
    }

    return (
        <AppLayout>
            <div className="space-y-6">
                <div className="bg-white dark:bg-kick-surface rounded-lg shadow-sm border border-gray-200 dark:border-kick-border p-6">
                    <h1 className="text-h2 font-semibold text-gray-900 dark:text-kick-text mb-6">Leaderboard</h1>

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
                                                                            src="/imgi_144_kick-streaming-platform-logo-icon.svg"
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
                                                                            src="/Discord-Emblem.png"
                                                                            alt="Discord connected"
                                                                            width={16}
                                                                            height={16}
                                                                            className="object-contain w-4 h-4"
                                                                            style={{ width: '16px', height: '16px' }}
                                                                            title="Connected via Discord"
                                                                        />
                                                                    )}
                                                                    {entry.verification_methods.telegram && (
                                                                        <img
                                                                            src="/Telegram-Logo-PNG-Image.png"
                                                                            alt="Telegram connected"
                                                                            width={16}
                                                                            height={16}
                                                                            className="object-contain w-4 h-4"
                                                                            style={{ width: '16px', height: '16px' }}
                                                                            title="Connected via Telegram"
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
        </AppLayout>
    )
}
