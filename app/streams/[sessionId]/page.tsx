'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import AppLayout from '../../../components/AppLayout'
import Image from 'next/image'

interface StreamSession {
    id: string
    session_title: string | null
    started_at: string
    ended_at: string | null
}

interface ChatMessage {
    message_id: string
    sender: {
        username: string
        profile_picture?: string
        identity: {
            username_color: string
            badges: Array<{ text: string; type: string }>
        }
    }
    content: string
    emotes: Array<{ emote_id: string; positions: Array<{ s: number; e: number }> }>
    timestamp: number
    points_earned: number
}

interface StreamStats {
    total_messages: number
    total_points: number
    unique_chatters: number
}

interface StreamAnalytics {
    session: {
        id: string
        title: string
        started_at: string
        ended_at: string | null
        peak_viewer_count: number
    }
    stats: {
        total_messages: number
        messages_with_emotes: number
        messages_with_text_only: number
        total_points: number
        unique_users: number
        avg_messages_per_user: number
        engagement_rate: number
        avg_message_length: number
    }
    engagement_types: Record<string, number>
    top_users: Array<{
        username: string
        messages: number
        emotes: number
        points: number
        activity_score: number
        engagement_types: Record<string, number>
    }>
}

export default function StreamDetailPage() {
    const params = useParams()
    const router = useRouter()
    const sessionId = params?.sessionId as string

    const [session, setSession] = useState<StreamSession | null>(null)
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [stats, setStats] = useState<StreamStats | null>(null)
    const [analytics, setAnalytics] = useState<StreamAnalytics | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [offset, setOffset] = useState(0)
    const [total, setTotal] = useState(0)
    const [loadingMore, setLoadingMore] = useState(false)
    const [activeTab, setActiveTab] = useState<'chat' | 'analytics'>('chat')
    const limit = 100

    useEffect(() => {
        if (sessionId) {
            fetchStreamData()
            fetchAnalytics()
            if (activeTab === 'chat') {
                fetchChats()
            }
        }
    }, [sessionId])

    useEffect(() => {
        if (sessionId && offset > 0 && activeTab === 'chat') {
            fetchChats()
        }
    }, [offset, activeTab])

    const fetchAnalytics = async () => {
        try {
            const response = await fetch(`/api/analytics/stream?session_id=${sessionId}`)
            if (!response.ok) throw new Error('Failed to fetch analytics')
            const data = await response.json()
            setAnalytics(data)
        } catch (err) {
            console.error('Error fetching analytics:', err)
        }
    }

    const fetchStreamData = async () => {
        try {
            const response = await fetch(`/api/stream-session/leaderboard?session_id=${sessionId}`)
            if (!response.ok) throw new Error('Failed to fetch stream data')
            const data = await response.json()
            setSession({
                id: data.session_id,
                session_title: data.session_title,
                started_at: data.started_at,
                ended_at: data.ended_at,
            })
            if (data.stats) {
                setStats(data.stats)
            }
        } catch (err) {
            console.error('Error fetching stream data:', err)
        }
    }

    const fetchChats = async () => {
        try {
            if (offset === 0) {
                setLoading(true)
            } else {
                setLoadingMore(true)
            }
            setError(null)
            const response = await fetch(`/api/stream-session/${sessionId}/chats?limit=${limit}&offset=${offset}`)
            if (!response.ok) {
                throw new Error('Failed to fetch chats')
            }
            const data = await response.json()
            if (offset === 0) {
                setMessages(data.messages || [])
            } else {
                setMessages(prev => [...prev, ...(data.messages || [])])
            }
            setTotal(data.total || 0)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error')
        } finally {
            setLoading(false)
            setLoadingMore(false)
        }
    }

    const formatDate = (dateString: string) => {
        try {
            const date = new Date(dateString)
            return date.toLocaleString()
        } catch {
            return 'Invalid date'
        }
    }

    const formatTimestamp = (timestamp: number) => {
        try {
            const date = new Date(timestamp)
            return date.toLocaleTimeString()
        } catch {
            return ''
        }
    }

    const loadMore = () => {
        if (!loadingMore && offset + limit < total) {
            setOffset(prev => prev + limit)
        }
    }

    if (loading && !session) {
        return (
            <AppLayout>
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kick-purple"></div>
                </div>
            </AppLayout>
        )
    }

    if (error && !session) {
        return (
            <AppLayout>
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <p className="text-red-800 dark:text-red-200">Error: {error}</p>
                </div>
            </AppLayout>
        )
    }

    return (
        <AppLayout>
            <div className="space-y-6">
                {/* Header */}
                <div className="bg-white dark:bg-kick-surface rounded-lg shadow-sm border border-gray-200 dark:border-kick-border p-6">
                    <button
                        onClick={() => router.back()}
                        className="mb-4 text-kick-purple hover:text-kick-purple/80 flex items-center gap-2"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Back to Past Streams
                    </button>

                    <h1 className="text-2xl font-bold text-gray-900 dark:text-kick-text mb-4">
                        {session?.session_title || 'Untitled Stream'}
                    </h1>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div>
                            <p className="text-sm text-gray-600 dark:text-kick-text-secondary">Started</p>
                            <p className="font-medium text-gray-900 dark:text-kick-text">
                                {session?.started_at ? formatDate(session.started_at) : 'N/A'}
                            </p>
                        </div>
                        {session?.ended_at && (
                            <div>
                                <p className="text-sm text-gray-600 dark:text-kick-text-secondary">Ended</p>
                                <p className="font-medium text-gray-900 dark:text-kick-text">
                                    {formatDate(session.ended_at)}
                                </p>
                            </div>
                        )}
                        {stats && (
                            <>
                                <div>
                                    <p className="text-sm text-gray-600 dark:text-kick-text-secondary">Total Messages</p>
                                    <p className="font-medium text-gray-900 dark:text-kick-text">
                                        {stats.total_messages.toLocaleString()}
                                    </p>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Stats Grid */}
                    {stats && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-gray-200 dark:border-kick-border">
                            <div className="bg-kick-purple/10 rounded-lg p-4">
                                <p className="text-sm text-gray-600 dark:text-kick-text-secondary mb-1">Total Points</p>
                                <p className="text-2xl font-bold text-kick-purple">
                                    {stats.total_points.toLocaleString()}
                                </p>
                            </div>
                            <div className="bg-kick-green/10 rounded-lg p-4">
                                <p className="text-sm text-gray-600 dark:text-kick-text-secondary mb-1">Unique Chatters</p>
                                <p className="text-2xl font-bold text-kick-green">
                                    {stats.unique_chatters.toLocaleString()}
                                </p>
                            </div>
                            <div className="bg-blue-500/10 rounded-lg p-4">
                                <p className="text-sm text-gray-600 dark:text-kick-text-secondary mb-1">Total Messages</p>
                                <p className="text-2xl font-bold text-blue-500">
                                    {stats.total_messages.toLocaleString()}
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Tabs */}
                <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-kick-border">
                    <button
                        onClick={() => setActiveTab('chat')}
                        className={`px-4 py-2 font-medium transition-colors ${
                            activeTab === 'chat'
                                ? 'text-kick-purple border-b-2 border-kick-purple'
                                : 'text-gray-600 dark:text-kick-text-secondary hover:text-gray-900 dark:hover:text-kick-text'
                        }`}
                    >
                        Chat Messages
                    </button>
                    <button
                        onClick={() => setActiveTab('analytics')}
                        className={`px-4 py-2 font-medium transition-colors ${
                            activeTab === 'analytics'
                                ? 'text-kick-purple border-b-2 border-kick-purple'
                                : 'text-gray-600 dark:text-kick-text-secondary hover:text-gray-900 dark:hover:text-kick-text'
                        }`}
                    >
                        Analytics
                    </button>
                </div>

                {/* Chat Messages */}
                {activeTab === 'chat' ? (
                    <div className="bg-white dark:bg-kick-surface rounded-lg shadow-sm border border-gray-200 dark:border-kick-border p-6">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">Chat Messages</h2>

                        {loading && messages.length === 0 ? (
                            <div className="flex items-center justify-center h-64">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kick-purple"></div>
                            </div>
                        ) : error ? (
                            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                                <p className="text-red-800 dark:text-red-200">Error: {error}</p>
                            </div>
                        ) : messages.length === 0 ? (
                            <div className="text-center py-12">
                                <p className="text-gray-600 dark:text-kick-text-secondary">No messages found for this stream.</p>
                            </div>
                        ) : (
                            <>
                                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                                    {messages.map((msg) => (
                                        <div
                                            key={msg.message_id}
                                            className="flex items-start gap-3 p-3 hover:bg-gray-50 dark:hover:bg-kick-surface-hover rounded-lg transition-colors"
                                        >
                                            <div className="flex-shrink-0">
                                                {msg.sender.profile_picture ? (
                                                    <img
                                                        src={msg.sender.profile_picture}
                                                        alt={msg.sender.username}
                                                        className="w-8 h-8 rounded-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-kick-surface-hover flex items-center justify-center">
                                                        <span className="text-xs font-medium text-gray-600 dark:text-kick-text-secondary">
                                                            {msg.sender.username.charAt(0).toUpperCase()}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span
                                                        className="font-medium text-sm"
                                                        style={{ color: msg.sender.identity.username_color || '#FFFFFF' }}
                                                    >
                                                        {msg.sender.username}
                                                    </span>
                                                    <span className="text-xs text-gray-500 dark:text-kick-text-muted">
                                                        {formatTimestamp(msg.timestamp)}
                                                    </span>
                                                    {msg.points_earned > 0 ? (
                                                        <span className="text-xs text-kick-purple font-medium">
                                                            +{msg.points_earned}pts
                                                        </span>
                                                    ) : msg.points_earned === 0 ? (
                                                        <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-kick-text-secondary" title="Message sent too quickly (rate limited)">
                                                            <svg className="w-3.5 h-3.5 text-red-500 dark:text-red-400" fill="currentColor" viewBox="0 0 20 20">
                                                                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98 1.742 2.98H4.67c1.955 0 2.493-1.646 1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                                            </svg>
                                                            <span>0 pts</span>
                                                        </span>
                                                    ) : null}
                                                </div>
                                                <p className="text-sm text-gray-900 dark:text-kick-text break-words">
                                                    {msg.content}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {offset + limit < total && (
                                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-kick-border">
                                        <button
                                            onClick={loadMore}
                                            disabled={loadingMore}
                                            className="w-full px-4 py-2 bg-kick-purple/20 text-kick-purple rounded-lg hover:bg-kick-purple/30 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {loadingMore ? 'Loading...' : `Load More (${total - offset - limit} remaining)`}
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                ) : analytics ? (
                    <div className="bg-white dark:bg-kick-surface rounded-lg shadow-sm border border-gray-200 dark:border-kick-border p-6">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-6">Stream Analytics</h2>

                        {/* Stats Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                            <div className="bg-kick-purple/10 rounded-lg p-4">
                                <p className="text-sm text-gray-600 dark:text-kick-text-secondary mb-1">Total Messages</p>
                                <p className="text-2xl font-bold text-kick-purple">
                                    {analytics.stats.total_messages.toLocaleString()}
                                </p>
                            </div>
                            <div className="bg-kick-green/10 rounded-lg p-4">
                                <p className="text-sm text-gray-600 dark:text-kick-text-secondary mb-1">Messages with Emotes</p>
                                <p className="text-2xl font-bold text-kick-green">
                                    {analytics.stats.messages_with_emotes.toLocaleString()}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-kick-text-muted mt-1">
                                    {analytics.stats.total_messages > 0
                                        ? `${((analytics.stats.messages_with_emotes / analytics.stats.total_messages) * 100).toFixed(1)}%`
                                        : '0%'}
                                </p>
                            </div>
                            <div className="bg-blue-500/10 rounded-lg p-4">
                                <p className="text-sm text-gray-600 dark:text-kick-text-secondary mb-1">Total Points</p>
                                <p className="text-2xl font-bold text-blue-500">
                                    {analytics.stats.total_points.toLocaleString()}
                                </p>
                            </div>
                            <div className="bg-orange-500/10 rounded-lg p-4">
                                <p className="text-sm text-gray-600 dark:text-kick-text-secondary mb-1">Unique Users</p>
                                <p className="text-2xl font-bold text-orange-500">
                                    {analytics.stats.unique_users.toLocaleString()}
                                </p>
                            </div>
                        </div>

                        {/* Performance Metrics */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                            <div className="bg-gray-50 dark:bg-kick-dark rounded-lg p-4 border border-gray-200 dark:border-kick-border">
                                <p className="text-xs text-gray-600 dark:text-kick-text-secondary mb-1">Avg Messages/User</p>
                                <p className="text-xl font-bold text-gray-900 dark:text-kick-text">
                                    {analytics.stats.avg_messages_per_user.toLocaleString()}
                                </p>
                            </div>
                            <div className="bg-gray-50 dark:bg-kick-dark rounded-lg p-4 border border-gray-200 dark:border-kick-border">
                                <p className="text-xs text-gray-600 dark:text-kick-text-secondary mb-1">Avg Message Length</p>
                                <p className="text-xl font-bold text-gray-900 dark:text-kick-text">
                                    {analytics.stats.avg_message_length} chars
                                </p>
                            </div>
                            <div className="bg-gray-50 dark:bg-kick-dark rounded-lg p-4 border border-gray-200 dark:border-kick-border">
                                <p className="text-xs text-gray-600 dark:text-kick-text-secondary mb-1">Avg Messages/Viewer</p>
                                <p className="text-xl font-bold text-gray-900 dark:text-kick-text">
                                    {analytics.stats.engagement_rate.toFixed(2)}
                                </p>
                            </div>
                        </div>

                        {/* Engagement Types */}
                        {Object.keys(analytics.engagement_types).some(key => analytics.engagement_types[key] > 0) && (
                            <div className="mb-6">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-kick-text mb-4">Engagement Types</h3>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                                    {Object.entries(analytics.engagement_types)
                                        .filter(([_, count]) => count > 0)
                                        .sort(([_, a], [__, b]) => b - a)
                                        .map(([type, count]) => {
                                            const engagementLabels: Record<string, string> = {
                                                command: 'Commands',
                                                question: 'Questions',
                                                reaction: 'Reactions',
                                                short_message: 'Short Messages',
                                                enthusiastic: 'Enthusiastic',
                                                conversation: 'Conversations',
                                                discussion: 'Discussions',
                                                emote_response: 'Emote Responses',
                                                regular: 'Regular Messages',
                                            }
                                            const totalEngagement = Object.values(analytics.engagement_types).reduce((sum, val) => sum + val, 0)
                                            return (
                                                <div key={type} className="bg-gray-50 dark:bg-kick-dark rounded-lg p-4 border border-gray-200 dark:border-kick-border">
                                                    <p className="text-xs text-gray-600 dark:text-kick-text-secondary mb-1">
                                                        {engagementLabels[type] || type}
                                                    </p>
                                                    <p className="text-xl font-bold text-gray-900 dark:text-kick-text">{count.toLocaleString()}</p>
                                                    <p className="text-xs text-gray-500 dark:text-kick-text-muted mt-1">
                                                        {totalEngagement > 0 ? `${((count / totalEngagement) * 100).toFixed(1)}%` : '0%'}
                                                    </p>
                                                </div>
                                            )
                                        })}
                                </div>
                            </div>
                        )}

                        {/* Top Users */}
                        {analytics.top_users.length > 0 && (
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-kick-text mb-4">Top Contributors</h3>
                                <div className="overflow-x-auto">
                                    <table className="w-full border-collapse">
                                        <thead>
                                            <tr className="border-b border-gray-200 dark:border-kick-border">
                                                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-kick-text-secondary">Rank</th>
                                                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-kick-text-secondary">User</th>
                                                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-kick-text-secondary">Activity Score</th>
                                                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-kick-text-secondary">Messages</th>
                                                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-kick-text-secondary">Emotes</th>
                                                <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-kick-text-secondary">Points</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {analytics.top_users.map((user, index) => (
                                                <tr
                                                    key={user.username}
                                                    className="border-b border-gray-100 dark:border-kick-border hover:bg-gray-50 dark:hover:bg-kick-dark transition-colors"
                                                >
                                                    <td className="py-3 px-4">
                                                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                                                            index === 0 ? 'bg-yellow-500 text-white' :
                                                            index === 1 ? 'bg-gray-400 text-white' :
                                                            index === 2 ? 'bg-orange-600 text-white' :
                                                            'bg-gray-200 dark:bg-kick-surface text-gray-700 dark:text-kick-text'
                                                        }`}>
                                                            {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <span className="font-medium text-gray-900 dark:text-kick-text">{user.username}</span>
                                                    </td>
                                                    <td className="py-3 px-4 text-right">
                                                        <span className="font-bold text-kick-purple">{user.activity_score.toLocaleString()}</span>
                                                    </td>
                                                    <td className="py-3 px-4 text-right text-gray-900 dark:text-kick-text">
                                                        {user.messages.toLocaleString()}
                                                    </td>
                                                    <td className="py-3 px-4 text-right text-gray-900 dark:text-kick-text">
                                                        {user.emotes.toLocaleString()}
                                                    </td>
                                                    <td className="py-3 px-4 text-right text-gray-900 dark:text-kick-text">
                                                        {user.points.toLocaleString()}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="bg-white dark:bg-kick-surface rounded-lg shadow-sm border border-gray-200 dark:border-kick-border p-6">
                        <div className="flex items-center justify-center h-64">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kick-purple"></div>
                        </div>
                    </div>
                )}
            </div>
        </AppLayout>
    )
}
