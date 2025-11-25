'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import AppLayout from '@/components/AppLayout'

// Activity Chart Component
function ActivityChart({ data }: { data: DailyActivity[] }) {
    if (!data || data.length === 0) {
        return <div className="text-center text-gray-500 dark:text-kick-text-secondary py-8">No data available</div>
    }

    const maxMessages = Math.max(...data.map(d => d.messages), 1)
    const maxEmotes = Math.max(...data.map(d => d.emotes), 1)
    const chartHeight = 200
    const chartWidth = Math.max(800, data.length * 30)
    const padding = 40
    const usableWidth = chartWidth - padding * 2
    const usableHeight = chartHeight - padding * 2

    const getX = (index: number) => {
        if (data.length === 1) return padding + usableWidth / 2
        return padding + (index / (data.length - 1)) * usableWidth
    }
    const getY = (value: number, max: number) => chartHeight - padding - (value / max) * usableHeight

    // Create path for messages line
    const messagesPath = data.map((d, i) => {
        const x = getX(i)
        const y = getY(d.messages, maxMessages)
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
    }).join(' ')

    // Create path for emotes line
    const emotesPath = data.map((d, i) => {
        const x = getX(i)
        const y = getY(d.emotes, maxEmotes)
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
    }).join(' ')

    // Format date for display
    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr)
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }

    return (
        <div className="overflow-x-auto">
            <svg width={chartWidth} height={chartHeight + 40} className="min-w-full">
                {/* Grid lines */}
                {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                    const y = chartHeight - padding - ratio * usableHeight
                    return (
                        <line
                            key={ratio}
                            x1={padding}
                            y1={y}
                            x2={chartWidth - padding}
                            y2={y}
                            stroke="currentColor"
                            strokeWidth="1"
                            className="text-gray-200 dark:text-gray-700"
                            opacity="0.5"
                        />
                    )
                })}

                {/* Messages line */}
                <path
                    d={messagesPath}
                    fill="none"
                    stroke="#9333EA"
                    strokeWidth="2"
                    className="drop-shadow-sm"
                />

                {/* Emotes line */}
                <path
                    d={emotesPath}
                    fill="none"
                    stroke="#10B981"
                    strokeWidth="2"
                    className="drop-shadow-sm"
                />

                {/* Data points */}
                {data.map((d, i) => {
                    const x = getX(i)
                    const messagesY = getY(d.messages, maxMessages)
                    const emotesY = getY(d.emotes, maxEmotes)
                    return (
                        <g key={i}>
                            <circle cx={x} cy={messagesY} r="3" fill="#9333EA" />
                            <circle cx={x} cy={emotesY} r="3" fill="#10B981" />
                        </g>
                    )
                })}

                {/* X-axis labels */}
                {data.filter((_, i) => {
                    const step = Math.max(1, Math.ceil(data.length / 8))
                    return i % step === 0 || i === data.length - 1
                }).map((d, i) => {
                    const index = data.findIndex(item => item.date === d.date)
                    const x = getX(index)
                    return (
                        <text
                            key={`${d.date}-${i}`}
                            x={x}
                            y={chartHeight + 25}
                            textAnchor="middle"
                            className="text-xs fill-gray-600 dark:fill-kick-text-secondary"
                        >
                            {formatDate(d.date)}
                        </text>
                    )
                })}

                {/* Y-axis labels */}
                {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                    const y = chartHeight - padding - ratio * usableHeight
                    const value = Math.round(maxMessages * ratio)
                    return (
                        <text
                            key={ratio}
                            x={padding - 10}
                            y={y + 4}
                            textAnchor="end"
                            className="text-xs fill-gray-600 dark:fill-kick-text-secondary"
                        >
                            {value}
                        </text>
                    )
                })}
            </svg>

            {/* Legend */}
            <div className="flex items-center justify-center gap-6 mt-4">
                <div className="flex items-center gap-2">
                    <div className="w-4 h-0.5 bg-purple-600"></div>
                    <span className="text-sm text-gray-600 dark:text-kick-text-secondary">Messages</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-4 h-0.5 bg-green-600"></div>
                    <span className="text-sm text-gray-600 dark:text-kick-text-secondary">Messages with Emotes</span>
                </div>
            </div>
        </div>
    )
}

interface UserActivity {
    rank: number
    username: string
    profile_picture_url: string | null
    total_points: number
    total_emotes: number
    activity_breakdown: {
        messages: number
        emotes: number
        messages_with_emotes: number
        points: number
        streams_watched: number
        avg_points_per_stream: number
        avg_messages_per_stream: number
    }
    engagement_breakdown: {
        engagement_types: Record<string, number>
        avg_message_length: number
        longest_message: number
        total_messages_analyzed: number
    }
    activity_score: number
    last_point_earned_at: string | null
}

interface ActivityTypes {
    messages: number
    messages_with_emotes: number
    messages_with_text_only: number
    emotes: number
}

interface DailyActivity {
    date: string
    messages: number
    emotes: number
}

interface PerformanceMetrics {
    avg_messages_per_stream: number
    avg_viewers_per_stream: number
    engagement_rate: number
    avg_messages_per_user: number
    total_streams_analyzed: number
}

interface TopStream {
    rank: number
    messages: number
    viewers: number
    date: string
    title: string
}

interface OverallStats {
    total_messages: number
    total_points: number
    activity_types: ActivityTypes
    engagement_types?: Record<string, number>
    avg_message_length?: number
    daily_activity?: DailyActivity[]
    performance_metrics?: PerformanceMetrics
    top_streams?: TopStream[]
}

export default function AnalyticsPage() {
    const router = useRouter()
    const [userData, setUserData] = useState<any>(null)
    const [stats, setStats] = useState({
        totalViews: 0,
        totalMessages: 0,
        activeUsers: 0,
        totalStreams: 0,
        totalPoints: 0,
    })
    const [activityTypes, setActivityTypes] = useState<ActivityTypes>({
        messages: 0,
        messages_with_emotes: 0,
        messages_with_text_only: 0,
        emotes: 0,
    })
    const [overallStats, setOverallStats] = useState<OverallStats | null>(null)
    const [topUsers, setTopUsers] = useState<UserActivity[]>([])
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<'overview' | 'users'>('overview')
    const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set())

    useEffect(() => {
        // Check admin access
        const token = localStorage.getItem('kick_access_token')
        if (!token) {
            router.push('/')
            return
        }

        fetch(`/api/user?access_token=${encodeURIComponent(token)}`)
            .then(res => res.json())
            .then(data => {
                if (!data.is_admin) {
                    router.push('/')
                    return
                }
                setUserData(data)
                fetchAnalytics()
            })
            .catch(() => router.push('/'))
    }, [router])

    const fetchAnalytics = async () => {
        try {
            setLoading(true)

            // Fetch total messages
            const messagesResponse = await fetch('/api/chat?limit=1')
            const messagesData = messagesResponse.ok ? await messagesResponse.json() : { total: 0 }

            // Fetch total streams
            const streamsResponse = await fetch('/api/stream-sessions?limit=1', {
                credentials: 'include', // Include cookies for authentication
            })
            const streamsData = streamsResponse.ok ? await streamsResponse.json() : { total: 0 }

            // Fetch total users and points
            const leaderboardResponse = await fetch('/api/leaderboard?limit=1')
            const leaderboardData = leaderboardResponse.ok ? await leaderboardResponse.json() : { total: 0, leaderboard: [] }

            // Calculate total points
            const totalPointsResponse = await fetch('/api/leaderboard?limit=1000')
            const totalPointsData = totalPointsResponse.ok ? await totalPointsResponse.json() : { leaderboard: [] }
            const totalPoints = totalPointsData.leaderboard.reduce((sum: number, entry: any) => sum + entry.total_points, 0)

            // Get unique users from messages (approximate active users)
            const activeUsers = leaderboardData.total || 0

            // Calculate total views from stream sessions
            const streamsDetailResponse = await fetch('/api/stream-sessions?limit=1000', {
                credentials: 'include', // Include cookies for authentication
            })
            const streamsDetailData = streamsDetailResponse.ok ? await streamsDetailResponse.json() : { sessions: [] }
            const totalViews = streamsDetailData.sessions.reduce((sum: number, session: any) => sum + session.peak_viewer_count, 0)

            // Fetch detailed analytics
            const token = localStorage.getItem('kick_access_token')
            const detailedResponse = await fetch('/api/analytics/detailed?limit=50', {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            })
            const detailedData = detailedResponse.ok ? await detailedResponse.json() : { users: [], overall_stats: {} }

            setStats({
                totalViews,
                totalMessages: messagesData.total || 0,
                activeUsers,
                totalStreams: streamsData.total || 0,
                totalPoints,
            })

            if (detailedData.overall_stats) {
                if (detailedData.overall_stats.activity_types) {
                    setActivityTypes(detailedData.overall_stats.activity_types)
                }
                setOverallStats(detailedData.overall_stats)
            }

            if (detailedData.users) {
                setTopUsers(detailedData.users)
            }
        } catch (error) {
            console.error('Failed to fetch analytics:', error)
        } finally {
            setLoading(false)
        }
    }

    if (!userData || !userData.is_admin) {
        return (
            <AppLayout>
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kick-purple"></div>
                </div>
            </AppLayout>
        )
    }

    return (
        <AppLayout>
            <div className="space-y-6">
                <div className="bg-white dark:bg-kick-surface rounded-lg shadow-sm border border-gray-200 dark:border-kick-border p-6">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-kick-text mb-6">Analytics</h1>

                    {/* Tabs */}
                    <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-kick-border">
                        <button
                            onClick={() => setActiveTab('overview')}
                            className={`px-4 py-2 font-medium transition-colors ${
                                activeTab === 'overview'
                                    ? 'text-kick-purple border-b-2 border-kick-purple'
                                    : 'text-gray-600 dark:text-kick-text-secondary hover:text-gray-900 dark:hover:text-kick-text'
                            }`}
                        >
                            Overview
                        </button>
                        <button
                            onClick={() => setActiveTab('users')}
                            className={`px-4 py-2 font-medium transition-colors ${
                                activeTab === 'users'
                                    ? 'text-kick-purple border-b-2 border-kick-purple'
                                    : 'text-gray-600 dark:text-kick-text-secondary hover:text-gray-900 dark:hover:text-kick-text'
                            }`}
                        >
                            Top Users
                        </button>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center h-64">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kick-purple"></div>
                        </div>
                    ) : activeTab === 'overview' ? (
                        <>
                            {/* Overall Stats */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                                <div className="bg-kick-purple/80 dark:bg-kick-purple/60 rounded-lg p-6 text-white">
                                    <p className="text-sm opacity-90 mb-2">Total Views</p>
                                    <p className="text-3xl font-bold">{stats.totalViews.toLocaleString()}</p>
                                </div>
                                <div className="bg-kick-purple/80 dark:bg-kick-purple/60 rounded-lg p-6 text-white">
                                    <p className="text-sm opacity-90 mb-2">Total Messages</p>
                                    <p className="text-3xl font-bold">{stats.totalMessages.toLocaleString()}</p>
                                </div>
                                <div className="bg-kick-green/80 dark:bg-kick-green/60 rounded-lg p-6 text-white">
                                    <p className="text-sm opacity-90 mb-2">Active Users</p>
                                    <p className="text-3xl font-bold">{stats.activeUsers.toLocaleString()}</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                <div className="bg-kick-purple/80 dark:bg-kick-purple/60 rounded-lg p-6 text-white">
                                    <p className="text-sm opacity-90 mb-2">Total Streams</p>
                                    <p className="text-3xl font-bold">{stats.totalStreams.toLocaleString()}</p>
                                </div>
                                <div className="bg-kick-purple/80 dark:bg-kick-purple/60 rounded-lg p-6 text-white">
                                    <p className="text-sm opacity-90 mb-2">Total Points Awarded</p>
                                    <p className="text-3xl font-bold">{stats.totalPoints.toLocaleString()}</p>
                                </div>
                            </div>

                            {/* Activity Type Breakdown */}
                            <div className="mt-6">
                                <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">Activity Breakdown</h2>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div className="bg-gray-50 dark:bg-kick-dark rounded-lg p-4 border border-gray-200 dark:border-kick-border">
                                        <p className="text-sm text-gray-600 dark:text-kick-text-secondary mb-1">Total Messages</p>
                                        <p className="text-2xl font-bold text-gray-900 dark:text-kick-text">{activityTypes.messages.toLocaleString()}</p>
                                    </div>
                                    <div className="bg-gray-50 dark:bg-kick-dark rounded-lg p-4 border border-gray-200 dark:border-kick-border">
                                        <p className="text-sm text-gray-600 dark:text-kick-text-secondary mb-1">Messages with Emotes</p>
                                        <p className="text-2xl font-bold text-gray-900 dark:text-kick-text">{activityTypes.messages_with_emotes.toLocaleString()}</p>
                                        <p className="text-xs text-gray-500 dark:text-kick-text-muted mt-1">
                                            {activityTypes.messages > 0
                                                ? `${((activityTypes.messages_with_emotes / activityTypes.messages) * 100).toFixed(1)}%`
                                                : '0%'}
                                        </p>
                                    </div>
                                    <div className="bg-gray-50 dark:bg-kick-dark rounded-lg p-4 border border-gray-200 dark:border-kick-border">
                                        <p className="text-sm text-gray-600 dark:text-kick-text-secondary mb-1">Text Only Messages</p>
                                        <p className="text-2xl font-bold text-gray-900 dark:text-kick-text">{activityTypes.messages_with_text_only.toLocaleString()}</p>
                                        <p className="text-xs text-gray-500 dark:text-kick-text-muted mt-1">
                                            {activityTypes.messages > 0
                                                ? `${((activityTypes.messages_with_text_only / activityTypes.messages) * 100).toFixed(1)}%`
                                                : '0%'}
                                        </p>
                                    </div>
                                    <div className="bg-gray-50 dark:bg-kick-dark rounded-lg p-4 border border-gray-200 dark:border-kick-border">
                                        <p className="text-sm text-gray-600 dark:text-kick-text-secondary mb-1">Total Emotes Sent</p>
                                        <p className="text-2xl font-bold text-gray-900 dark:text-kick-text">{activityTypes.emotes.toLocaleString()}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Performance Metrics */}
                            {overallStats?.performance_metrics && (
                                <div className="mt-6">
                                    <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">Performance Metrics</h2>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                                        <div className="bg-gradient-to-br from-purple-500/10 to-purple-600/10 dark:from-purple-500/20 dark:to-purple-600/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
                                            <p className="text-xs text-gray-600 dark:text-kick-text-secondary mb-1">Avg Messages/Stream</p>
                                            <p className="text-xl font-bold text-gray-900 dark:text-kick-text">
                                                {overallStats.performance_metrics.avg_messages_per_stream.toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="bg-gradient-to-br from-green-500/10 to-green-600/10 dark:from-green-500/20 dark:to-green-600/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
                                            <p className="text-xs text-gray-600 dark:text-kick-text-secondary mb-1">Avg Viewers/Stream</p>
                                            <p className="text-xl font-bold text-gray-900 dark:text-kick-text">
                                                {overallStats.performance_metrics.avg_viewers_per_stream.toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/10 dark:from-blue-500/20 dark:to-blue-600/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                                            <p className="text-xs text-gray-600 dark:text-kick-text-secondary mb-1">Avg Messages/Viewer</p>
                                            <p className="text-xl font-bold text-gray-900 dark:text-kick-text">
                                                {overallStats.performance_metrics.engagement_rate.toFixed(2)}
                                            </p>
                                        </div>
                                        <div className="bg-gradient-to-br from-orange-500/10 to-orange-600/10 dark:from-orange-500/20 dark:to-orange-600/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
                                            <p className="text-xs text-gray-600 dark:text-kick-text-secondary mb-1">Avg Messages/User</p>
                                            <p className="text-xl font-bold text-gray-900 dark:text-kick-text">
                                                {overallStats.performance_metrics.avg_messages_per_user.toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="bg-gradient-to-br from-pink-500/10 to-pink-600/10 dark:from-pink-500/20 dark:to-pink-600/20 rounded-lg p-4 border border-pink-200 dark:border-pink-800">
                                            <p className="text-xs text-gray-600 dark:text-kick-text-secondary mb-1">Streams Analyzed</p>
                                            <p className="text-xl font-bold text-gray-900 dark:text-kick-text">
                                                {overallStats.performance_metrics.total_streams_analyzed.toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Daily Activity Chart */}
                            {overallStats?.daily_activity && overallStats.daily_activity.length > 0 && (
                                <div className="mt-6">
                                    <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">Daily Activity (Last 30 Days)</h2>
                                    <div className="bg-gray-50 dark:bg-kick-dark rounded-lg p-6 border border-gray-200 dark:border-kick-border">
                                        <ActivityChart data={overallStats.daily_activity} />
                                    </div>
                                </div>
                            )}

                            {/* Engagement Type Breakdown */}
                            {overallStats?.engagement_types && (
                                <div className="mt-6">
                                    <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                                        Engagement Types
                                        {overallStats.avg_message_length && (
                                            <span className="text-sm font-normal text-gray-600 dark:text-kick-text-secondary ml-2">
                                                (Avg: {overallStats.avg_message_length} chars)
                                            </span>
                                        )}
                                    </h2>
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                                        {Object.entries(overallStats.engagement_types)
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
                                                const totalEngagement = Object.values(overallStats.engagement_types!).reduce((sum, val) => sum + val, 0)
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

                            {/* Top Streams */}
                            {overallStats?.top_streams && overallStats.top_streams.length > 0 && (
                                <div className="mt-6">
                                    <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">Top Streams by Messages</h2>
                                    <div className="bg-gray-50 dark:bg-kick-dark rounded-lg p-6 border border-gray-200 dark:border-kick-border">
                                        <div className="space-y-3">
                                            {overallStats.top_streams.map((stream) => (
                                                <div key={stream.rank} className="flex items-center justify-between py-2 border-b border-gray-200 dark:border-kick-border last:border-0">
                                                    <div className="flex items-center gap-4 flex-1 min-w-0">
                                                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold flex-shrink-0 ${
                                                            stream.rank === 1 ? 'bg-yellow-500 text-white' :
                                                            stream.rank === 2 ? 'bg-gray-400 text-white' :
                                                            stream.rank === 3 ? 'bg-orange-600 text-white' :
                                                            'bg-gray-200 dark:bg-kick-surface text-gray-700 dark:text-kick-text'
                                                        }`}>
                                                            {stream.rank === 1 ? '🥇' : stream.rank === 2 ? '🥈' : stream.rank === 3 ? '🥉' : stream.rank}
                                                        </span>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm font-semibold text-gray-900 dark:text-kick-text truncate">
                                                                {stream.title}
                                                            </p>
                                                            <p className="text-xs text-gray-600 dark:text-kick-text-secondary">
                                                                {stream.messages.toLocaleString()} messages • {stream.viewers.toLocaleString()} viewers • {new Date(stream.date).toLocaleDateString()}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right flex-shrink-0 ml-4">
                                                        <p className="text-sm font-semibold text-kick-purple">
                                                            {stream.viewers > 0 ? (stream.messages / stream.viewers).toFixed(1) : '0'} msg/viewer
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">Best Viewers (Ranked by Activity Score)</h2>
                            <div className="overflow-x-auto">
                                <table className="w-full border-collapse">
                                    <thead>
                                        <tr className="border-b border-gray-200 dark:border-kick-border">
                                            <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-kick-text-secondary"></th>
                                            <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-kick-text-secondary">Rank</th>
                                            <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-kick-text-secondary">User</th>
                                            <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-kick-text-secondary">Activity Score</th>
                                            <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-kick-text-secondary">Points</th>
                                            <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-kick-text-secondary">Messages</th>
                                            <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-kick-text-secondary">Emotes</th>
                                            <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-kick-text-secondary">Streams</th>
                                            <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-kick-text-secondary">Avg/Stream</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {topUsers.map((user) => {
                                            const isExpanded = expandedUsers.has(user.username)
                                            const engagementTypes = user.engagement_breakdown?.engagement_types || {}
                                            const totalEngagement = Object.values(engagementTypes).reduce((sum, val) => sum + val, 0)

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

                                            return (
                                                <>
                                                    <tr
                                                        key={user.username}
                                                        className="border-b border-gray-100 dark:border-kick-border hover:bg-gray-50 dark:hover:bg-kick-dark transition-colors"
                                                    >
                                                        <td className="py-3 px-4">
                                                            <button
                                                                onClick={() => {
                                                                    const newExpanded = new Set(expandedUsers)
                                                                    if (isExpanded) {
                                                                        newExpanded.delete(user.username)
                                                                    } else {
                                                                        newExpanded.add(user.username)
                                                                    }
                                                                    setExpandedUsers(newExpanded)
                                                                }}
                                                                className="text-gray-500 hover:text-gray-700 dark:text-kick-text-secondary dark:hover:text-kick-text"
                                                            >
                                                                {isExpanded ? '▼' : '▶'}
                                                            </button>
                                                        </td>
                                                        <td className="py-3 px-4">
                                                            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                                                                user.rank === 1 ? 'bg-yellow-500 text-white' :
                                                                user.rank === 2 ? 'bg-gray-400 text-white' :
                                                                user.rank === 3 ? 'bg-orange-600 text-white' :
                                                                'bg-gray-200 dark:bg-kick-surface text-gray-700 dark:text-kick-text'
                                                            }`}>
                                                                {user.rank === 1 ? '🥇' : user.rank === 2 ? '🥈' : user.rank === 3 ? '🥉' : user.rank}
                                                            </span>
                                                        </td>
                                                        <td className="py-3 px-4">
                                                            <div className="flex items-center gap-3">
                                                                {user.profile_picture_url && user.profile_picture_url.trim() ? (() => {
                                                                    // CloudFront URLs might work directly, kick.com URLs need proxy
                                                                    const isCloudFront = user.profile_picture_url.includes('cloudfront.net') || user.profile_picture_url.includes('amazonaws.com')
                                                                    const isKickDomain = user.profile_picture_url.includes('kick.com') || user.profile_picture_url.includes('files.kick.com')
                                                                    const imageSrc = isCloudFront
                                                                        ? user.profile_picture_url
                                                                        : isKickDomain
                                                                        ? `/api/image-proxy?url=${encodeURIComponent(user.profile_picture_url)}`
                                                                        : user.profile_picture_url

                                                                    return (
                                                                        <img
                                                                            src={imageSrc}
                                                                            alt={user.username}
                                                                            width={32}
                                                                            height={32}
                                                                            className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                                                                            onError={(e) => {
                                                                                const target = e.target as HTMLImageElement
                                                                                // If direct URL failed and it's CloudFront, try proxy
                                                                                if (isCloudFront && !target.src.includes('/api/image-proxy') && user.profile_picture_url) {
                                                                                    target.src = `/api/image-proxy?url=${encodeURIComponent(user.profile_picture_url)}`
                                                                                } else if (isKickDomain && !target.src.includes('/api/image-proxy') && user.profile_picture_url) {
                                                                                    // Already using proxy, fallback to default
                                                                                    target.src = '/kick.jpg'
                                                                                } else {
                                                                                    target.src = '/kick.jpg'
                                                                                }
                                                                            }}
                                                                        />
                                                                    )
                                                                })() : (
                                                                    <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-kick-surface-hover flex items-center justify-center flex-shrink-0">
                                                                        <span className="text-gray-600 dark:text-kick-text-secondary text-xs font-medium">
                                                                            {user.username.charAt(0).toUpperCase()}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                                <span className="font-medium text-gray-900 dark:text-kick-text">{user.username}</span>
                                                            </div>
                                                        </td>
                                                        <td className="py-3 px-4 text-right">
                                                            <span className="font-bold text-kick-purple">{user.activity_score.toLocaleString()}</span>
                                                        </td>
                                                        <td className="py-3 px-4 text-right text-gray-900 dark:text-kick-text">
                                                            {user.activity_breakdown.points.toLocaleString()}
                                                        </td>
                                                        <td className="py-3 px-4 text-right text-gray-900 dark:text-kick-text">
                                                            {user.activity_breakdown.messages.toLocaleString()}
                                                        </td>
                                                        <td className="py-3 px-4 text-right text-gray-900 dark:text-kick-text">
                                                            {user.activity_breakdown.emotes.toLocaleString()}
                                                        </td>
                                                        <td className="py-3 px-4 text-right text-gray-900 dark:text-kick-text">
                                                            {user.activity_breakdown.streams_watched}
                                                        </td>
                                                        <td className="py-3 px-4 text-right text-sm text-gray-600 dark:text-kick-text-secondary">
                                                            {user.activity_breakdown.avg_points_per_stream.toFixed(1)} pts
                                                            <br />
                                                            {user.activity_breakdown.avg_messages_per_stream.toFixed(1)} msgs
                                                        </td>
                                                    </tr>
                                                    {isExpanded && user.engagement_breakdown && (
                                                        <tr className="border-b border-gray-100 dark:border-kick-border bg-gray-50 dark:bg-kick-dark">
                                                            <td colSpan={9} className="py-4 px-4">
                                                                <div className="space-y-4">
                                                                    <div className="flex items-center gap-6 text-sm">
                                                                        <div>
                                                                            <span className="text-gray-600 dark:text-kick-text-secondary">Avg Message Length: </span>
                                                                            <span className="font-semibold text-gray-900 dark:text-kick-text">{user.engagement_breakdown.avg_message_length.toFixed(1)} chars</span>
                                                                        </div>
                                                                        <div>
                                                                            <span className="text-gray-600 dark:text-kick-text-secondary">Longest Message: </span>
                                                                            <span className="font-semibold text-gray-900 dark:text-kick-text">{user.engagement_breakdown.longest_message} chars</span>
                                                                        </div>
                                                                    </div>
                                                                    <div>
                                                                        <h4 className="text-sm font-semibold text-gray-900 dark:text-kick-text mb-2">Engagement Types:</h4>
                                                                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                                                            {Object.entries(engagementTypes)
                                                                                .filter(([_, count]) => count > 0)
                                                                                .sort(([_, a], [__, b]) => b - a)
                                                                                .map(([type, count]) => (
                                                                                    <div key={type} className="bg-white dark:bg-kick-surface rounded-lg p-3 border border-gray-200 dark:border-kick-border">
                                                                                        <div className="text-xs text-gray-600 dark:text-kick-text-secondary mb-1">
                                                                                            {engagementLabels[type] || type}
                                                                                        </div>
                                                                                        <div className="text-lg font-bold text-gray-900 dark:text-kick-text">
                                                                                            {count}
                                                                                        </div>
                                                                                        <div className="text-xs text-gray-500 dark:text-kick-text-muted mt-1">
                                                                                            {totalEngagement > 0 ? `${((count / totalEngagement) * 100).toFixed(1)}%` : '0%'}
                                                                                        </div>
                                                                                    </div>
                                                                                ))}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </AppLayout>
    )
}
