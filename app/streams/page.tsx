'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '../../components/AppLayout'
import Image from 'next/image'

interface StreamSession {
    id: string
    broadcaster_user_id: string
    channel_slug: string
    session_title: string | null
    thumbnail_url: string | null
    started_at: string
    ended_at: string | null
    peak_viewer_count: number
    total_messages: number
    duration_seconds: number | null
    duration_formatted: string | null
    broadcaster: {
        username: string
        profile_picture_url: string | null
    }
}

interface StreamLeaderboardEntry {
    rank: number
    user_id: string
    kick_user_id: string
    username: string
    profile_picture_url: string | null
    points_earned: number
}

export default function StreamsPage() {
    const router = useRouter()
    const [sessions, setSessions] = useState<StreamSession[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [total, setTotal] = useState(0)
    const [offset, setOffset] = useState(0)
    const [expandedSession, setExpandedSession] = useState<string | null>(null)
    const [sessionLeaderboards, setSessionLeaderboards] = useState<Record<string, StreamLeaderboardEntry[]>>({})
    const [loadingLeaderboards, setLoadingLeaderboards] = useState<Set<string>>(new Set())
    const limit = 20
    const [imageErrors, setImageErrors] = useState<Set<string>>(new Set())

    useEffect(() => {
        fetchStreams()
    }, [offset])

    const fetchStreams = async () => {
        try {
            setLoading(true)
            setError(null)
            const response = await fetch(`/api/stream-sessions?limit=${limit}&offset=${offset}`)
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Failed to fetch streams' }))
                throw new Error(errorData.error || `HTTP ${response.status}: Failed to fetch streams`)
            }
            const data = await response.json()
            // Safety check for response data
            setSessions(Array.isArray(data.sessions) ? data.sessions : [])
            setTotal(typeof data.total === 'number' ? data.total : 0)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error')
            setSessions([]) // Reset to empty array on error
            setTotal(0)
        } finally {
            setLoading(false)
        }
    }

    const formatDate = (dateString: string) => {
        try {
            const date = new Date(dateString)
            if (isNaN(date.getTime())) {
                return 'Invalid date'
            }
            return date.toLocaleString()
        } catch (error) {
            console.error('Error formatting date:', dateString, error)
            return 'Invalid date'
        }
    }

    const fetchSessionLeaderboard = async (sessionId: string) => {
        if (!sessionId || sessionLeaderboards[sessionId]) return // Already loaded or invalid ID

        try {
            setLoadingLeaderboards(prev => new Set(prev).add(sessionId))
            const response = await fetch(`/api/stream-session/leaderboard?session_id=${sessionId}`)
            if (!response.ok) {
                throw new Error('Failed to fetch leaderboard')
            }
            const data = await response.json()
            setSessionLeaderboards(prev => ({
                ...prev,
                [sessionId]: Array.isArray(data.leaderboard) ? data.leaderboard : [],
            }))
        } catch (err) {
            console.error('Error fetching session leaderboard:', err)
            // Set empty array on error to prevent retry loops
            setSessionLeaderboards(prev => ({
                ...prev,
                [sessionId]: [],
            }))
        } finally {
            setLoadingLeaderboards(prev => {
                const next = new Set(prev)
                next.delete(sessionId)
                return next
            })
        }
    }

    const toggleSessionExpansion = (sessionId: string) => {
        if (expandedSession === sessionId) {
            setExpandedSession(null)
        } else {
            setExpandedSession(sessionId)
            fetchSessionLeaderboard(sessionId)
        }
    }

    const getStatusBadge = () => {
        return (
            <span className="px-2 py-1 bg-gray-100 dark:bg-kick-surface-hover text-gray-600 dark:text-kick-text-secondary text-xs font-semibold rounded-full">
                ENDED
            </span>
        )
    }

    return (
        <AppLayout>
            <div className="space-y-6">
                <div className="bg-white dark:bg-kick-surface rounded-lg shadow-sm border border-gray-200 dark:border-kick-border p-6">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-kick-text mb-6">Past Streams</h1>

                    {loading ? (
                        <div className="flex items-center justify-center h-64">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kick-purple"></div>
                        </div>
                    ) : error ? (
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                            <p className="text-red-800 dark:text-red-200">Error: {error}</p>
                        </div>
                    ) : sessions.length === 0 ? (
                        <div className="text-center py-12">
                            <p className="text-gray-600 dark:text-kick-text-secondary">No stream sessions found.</p>
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {sessions.map((session) => (
                                    <div
                                        key={session.id}
                                        className="bg-white dark:bg-kick-surface rounded-lg border border-gray-200 dark:border-kick-border hover:shadow-lg transition-all cursor-pointer overflow-hidden"
                                        onClick={() => router.push(`/streams/${session.id}`)}
                                    >
                                        {/* Thumbnail */}
                                        {session.thumbnail_url && !imageErrors.has(session.id) ? (
                                            <div className="relative w-full h-48 bg-gray-100 dark:bg-kick-surface-hover">
                                                <Image
                                                    src={session.thumbnail_url.startsWith('http')
                                                        ? `/api/image-proxy?url=${encodeURIComponent(session.thumbnail_url)}`
                                                        : session.thumbnail_url}
                                                    alt={session.session_title || 'Stream thumbnail'}
                                                    fill
                                                    className="object-cover"
                                                    unoptimized
                                                    onError={() => {
                                                        setImageErrors(prev => new Set(prev).add(session.id))
                                                    }}
                                                />
                                                <div className="absolute top-2 right-2">
                                                    {getStatusBadge()}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="w-full h-48 bg-gradient-to-br from-kick-purple/20 to-kick-purple/10 flex items-center justify-center relative">
                                                <div className="absolute top-2 right-2">
                                                    {getStatusBadge()}
                                                </div>
                                                <div className="text-center">
                                                    <svg className="w-16 h-16 text-kick-purple/50 mx-auto mb-2" fill="currentColor" viewBox="0 0 20 20">
                                                        <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                                                    </svg>
                                                    <p className="text-sm text-gray-600 dark:text-kick-text-secondary">No thumbnail</p>
                                                </div>
                                            </div>
                                        )}

                                        <div className="p-6">
                                            <h3 className="text-lg font-semibold text-gray-900 dark:text-kick-text truncate mb-4">
                                                {session.session_title || 'Untitled Stream'}
                                            </h3>

                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between text-sm">
                                                    <span className="text-gray-600 dark:text-kick-text-secondary">Channel</span>
                                                    <span className="font-medium text-gray-900 dark:text-kick-text">
                                                        {session.channel_slug}
                                                    </span>
                                                </div>

                                                <div className="flex items-center justify-between text-sm">
                                                    <span className="text-gray-600 dark:text-kick-text-secondary">Started</span>
                                                    <span className="font-medium text-gray-900 dark:text-kick-text">
                                                        {formatDate(session.started_at)}
                                                    </span>
                                                </div>

                                                {session.ended_at && (
                                                    <div className="flex items-center justify-between text-sm">
                                                        <span className="text-gray-600 dark:text-kick-text-secondary">Ended</span>
                                                        <span className="font-medium text-gray-900 dark:text-kick-text">
                                                            {formatDate(session.ended_at)}
                                                        </span>
                                                    </div>
                                                )}

                                                {session.duration_formatted && (
                                                    <div className="flex items-center justify-between text-sm">
                                                        <span className="text-gray-600 dark:text-kick-text-secondary">Duration</span>
                                                        <span className="font-medium text-gray-900 dark:text-kick-text">
                                                            {session.duration_formatted}
                                                        </span>
                                                    </div>
                                                )}

                                                <div className="grid grid-cols-2 gap-4 pt-3 border-t border-gray-200 dark:border-kick-border">
                                                    <div>
                                                        <p className="text-xs text-gray-600 dark:text-kick-text-secondary mb-1">Peak Viewers</p>
                                                        <p className="text-lg font-bold text-kick-purple">
                                                            {(session.peak_viewer_count ?? 0).toLocaleString()}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs text-gray-600 dark:text-kick-text-secondary mb-1">Messages</p>
                                                        <p className="text-lg font-bold text-kick-purple">
                                                            {(session.total_messages ?? 0).toLocaleString()}
                                                        </p>
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        session.id && toggleSessionExpansion(session.id)
                                                    }}
                                                    disabled={!session.id}
                                                    className="w-full mt-4 px-4 py-2 bg-kick-purple/20 text-kick-purple rounded-lg hover:bg-kick-purple/30 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {expandedSession === session.id ? 'Hide' : 'Show'} Top 10 Leaderboard
                                                </button>

                                                {expandedSession === session.id && (
                                                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-kick-border">
                                                        <h4 className="text-sm font-semibold text-gray-900 dark:text-kick-text mb-3">
                                                            🏆 Top Chatters
                                                        </h4>
                                                        {loadingLeaderboards.has(session.id) ? (
                                                            <div className="flex items-center justify-center py-4">
                                                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-kick-purple"></div>
                                                            </div>
                                                        ) : sessionLeaderboards[session.id]?.length === 0 ? (
                                                            <p className="text-sm text-gray-600 dark:text-kick-text-muted text-center py-2">
                                                                No chatters in this stream
                                                            </p>
                                                        ) : (
                                                            <div className="space-y-2">
                                                                {sessionLeaderboards[session.id]?.map((entry) => {
                                                                    const username = entry.username || 'Unknown'
                                                                    const points = entry.points_earned ?? 0
                                                                    const userId = entry.user_id || ''

                                                                    return (
                                                                        <div
                                                                            key={userId}
                                                                            className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-kick-surface-hover transition-colors"
                                                                        >
                                                                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                                                                <span className="text-sm font-bold text-gray-600 dark:text-kick-text-secondary w-6 flex-shrink-0">
                                                                                    {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank ?? '?'}`}
                                                                                </span>
                                                                                {entry.profile_picture_url && !imageErrors.has(userId) ? (
                                                                                    <img
                                                                                        src={entry.profile_picture_url}
                                                                                        alt={username}
                                                                                        width={24}
                                                                                        height={24}
                                                                                        className="w-6 h-6 rounded-full object-cover flex-shrink-0"
                                                                                        onError={() => {
                                                                                            setImageErrors(prev => new Set(prev).add(userId))
                                                                                        }}
                                                                                    />
                                                                                ) : (
                                                                                    <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-kick-surface-hover flex items-center justify-center flex-shrink-0">
                                                                                        <span className="text-gray-600 dark:text-kick-text-secondary text-xs font-medium">
                                                                                            {username.charAt(0).toUpperCase()}
                                                                                        </span>
                                                                                    </div>
                                                                                )}
                                                                                <span className="text-sm font-medium text-gray-900 dark:text-kick-text truncate">
                                                                                    {username}
                                                                                </span>
                                                                            </div>
                                                                            <div className="flex items-center gap-1 flex-shrink-0">
                                                                                <span className="text-sm font-bold text-kick-purple">
                                                                                    {points.toLocaleString()}
                                                                                </span>
                                                                                <span className="text-xs text-gray-500 dark:text-kick-text-muted">pts</span>
                                                                            </div>
                                                                        </div>
                                                                    )
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
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
                                    <span className="text-sm text-gray-600 dark:text-kick-text-secondary">
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
