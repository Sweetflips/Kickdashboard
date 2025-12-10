'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import AppLayout from '../components/AppLayout'
import ChatFrame from '../components/ChatFrame'
import PromoCodeModal from '../components/PromoCodeModal'
import { Toast } from '../components/Toast'

interface Stream {
    is_live: boolean
    is_mature: boolean
    key?: string
    language?: string
    start_time?: string
    thumbnail?: string
    url?: string
    viewer_count?: number
    session_title?: string
    title?: string
}

interface Category {
    id?: number
    name?: string
    thumbnail?: string
}

interface ChannelData {
    banner_picture?: string
    broadcaster_user_id?: number
    category?: Category
    channel_description?: string
    slug?: string
    stream?: Stream | null
    livestream?: Stream | null
    stream_title?: string
    is_live?: boolean
    viewer_count?: number
    session_title?: string
    stream_started_at?: string | null
    chatroom_id?: number
    followers_count?: number
    last_live_at?: string | null
    user?: {
        id?: number
        username?: string
        profile_picture?: string
    }
    username?: string
    profile_picture?: string
    [key: string]: any
}

interface StreamLeaderboardEntry {
    rank: number
    user_id: string
    kick_user_id: string
    username: string
    profile_picture_url: string | null
    points_earned: number
    messages_sent?: number
    emotes_used?: number
}

export default function Dashboard() {
    const [channelData, setChannelData] = useState<ChannelData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [streamLeaderboard, setStreamLeaderboard] = useState<StreamLeaderboardEntry[]>([])
    const [imageErrors, setImageErrors] = useState<Set<string>>(new Set())
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
    const [hasActiveSession, setHasActiveSession] = useState<boolean>(false)
    const [streamStats, setStreamStats] = useState<{
        total_messages: number
        total_points: number
        unique_chatters: number
    } | null>(null)
    const [isAdmin, setIsAdmin] = useState<boolean>(false)
    const [adminCheckLoading, setAdminCheckLoading] = useState(true)
    const [streamDuration, setStreamDuration] = useState<string>('0:00:00')
    const [showPromoCodeModal, setShowPromoCodeModal] = useState(false)
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

    useEffect(() => {
        fetchChannelData()
        // Refresh every 60 seconds to reduce API calls
        const interval = setInterval(() => {
            fetchChannelData()
        }, 60000) // Refresh every 60 seconds (1 minute)
        return () => clearInterval(interval)
    }, [])

    // Check admin status on mount
    useEffect(() => {
        const checkAdminStatus = async () => {
            try {
                const token = localStorage.getItem('kick_access_token')
                if (!token) {
                    setIsAdmin(false)
                    setAdminCheckLoading(false)
                    return
                }

                // SECURITY: Use dedicated admin verification endpoint
                const response = await fetch('/api/admin/verify', {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                    },
                })
                if (response.ok) {
                    const data = await response.json()
                    setIsAdmin(data.is_admin === true)
                } else {
                    setIsAdmin(false)
                }
            } catch (error) {
                console.error('Error checking admin status:', error)
                setIsAdmin(false)
            } finally {
                setAdminCheckLoading(false)
            }
        }

        checkAdminStatus()
    }, [])

    const fetchChannelData = async () => {
        try {
            const response = await fetch('/api/channel?slug=sweetflips', {
                // Always bypass any HTTP cache so we never show a stale LIVE state
                cache: 'no-store',
            })
            if (!response.ok) {
                throw new Error('Failed to fetch channel data')
            }
            const data = await response.json()
            setChannelData(data)
            setError(null)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error')
        } finally {
            setLoading(false)
        }
    }

    const isLive = channelData?.is_live || false

    useEffect(() => {
        if (!channelData?.broadcaster_user_id) return

        // Only fetch leaderboard when stream is live
        if (!isLive) {
            // Clear leaderboard when stream goes offline - reset stats to zero
            setStreamLeaderboard([])
            setCurrentSessionId(null)
            setStreamStats({
                total_messages: 0,
                total_points: 0,
                unique_chatters: 0,
            })
            setHasActiveSession(false)
            return
        }

        const fetchStreamLeaderboard = async () => {
            try {
                // Always fetch fresh data from database - add timestamp to prevent caching
                const response = await fetch(`/api/stream-session/leaderboard?broadcaster_user_id=${channelData.broadcaster_user_id}&_t=${Date.now()}`)
                if (!response.ok) {
                    throw new Error('Failed to fetch stream leaderboard')
                }
                const data = await response.json()

                // If session ID changed, we have a new session - clear old leaderboard
                if (currentSessionId && data.session_id && currentSessionId !== data.session_id) {
                    setStreamLeaderboard([])
                    setCurrentSessionId(data.session_id)
                } else if (data.session_id && data.session_id !== currentSessionId) {
                    // Update session ID if it's different
                    setCurrentSessionId(data.session_id)
                }

                // Update leaderboard with data - smart merge to preserve unchanged entries
                if (data.leaderboard && Array.isArray(data.leaderboard)) {
                    if (data.leaderboard.length > 0) {
                        setStreamLeaderboard(prev => {
                            // Merge new data with existing, preserving unchanged entries
                            return data.leaderboard.map((newEntry: StreamLeaderboardEntry) => {
                                const existing = prev.find(e => e.user_id === newEntry.user_id)
                                // Only create new object if data changed
                                if (existing &&
                                    existing.rank === newEntry.rank &&
                                    existing.points_earned === newEntry.points_earned &&
                                    existing.messages_sent === newEntry.messages_sent &&
                                    existing.emotes_used === newEntry.emotes_used) {
                                    return existing
                                }
                                return newEntry
                            })
                        })
                    } else {
                        // Clear if no leaderboard data
                        setStreamLeaderboard([])
                        setCurrentSessionId(null)
                        setStreamStats({
                            total_messages: 0,
                            total_points: 0,
                            unique_chatters: 0,
                        })
                        setHasActiveSession(false)
                    }
                }

                // Update active session status
                setHasActiveSession(data.has_active_session || false)

                // Update stream stats
                if (data.stats) {
                    setStreamStats(data.stats)
                } else {
                    // If no stats provided, reset to zeros
                    setStreamStats({
                        total_messages: 0,
                        total_points: 0,
                        unique_chatters: 0,
                    })
                }
            } catch (err) {
                console.error('Error fetching stream leaderboard:', err)
            }
        }

        // Fetch immediately on mount and when dependencies change
        fetchStreamLeaderboard()
        // Refresh leaderboard every 60 seconds only when live
        const interval = setInterval(() => {
            if (isLive) {
                fetchStreamLeaderboard()
            }
        }, 60000)
        return () => clearInterval(interval)
    }, [channelData?.broadcaster_user_id, isLive])

    // Update stream duration every second when live
    useEffect(() => {
        if (!isLive || !channelData?.stream_started_at) {
            setStreamDuration('0:00:00')
            return
        }

        const startedAt = channelData.stream_started_at
        if (!startedAt) {
            setStreamDuration('0:00:00')
            return
        }

        const updateDuration = () => {
            const start = new Date(startedAt).getTime()
            const now = Date.now()
            const diff = now - start

            if (diff < 0) {
                console.warn(`[Duration] Negative duration detected! start=${new Date(startedAt).toISOString()}, now=${new Date(now).toISOString()}, diff=${diff}ms`)
                setStreamDuration('0:00:00')
                return
            }

            // Sanity check: stream can't be more than 72 hours old
            if (diff > 72 * 3600000) {
                console.warn(`[Duration] Suspiciously long duration: ${diff}ms (${Math.floor(diff / 3600000)}h)`);
            }

            const hours = Math.floor(diff / 3600000)
            const mins = Math.floor((diff % 3600000) / 60000)
            const secs = Math.floor((diff % 60000) / 1000)
            setStreamDuration(`${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`)
        }

        updateDuration()
        const interval = setInterval(updateDuration, 1000)
        return () => clearInterval(interval)
    }, [isLive, channelData?.stream_started_at])

    const viewerCount = channelData?.viewer_count || 0
    const streamTitle = channelData?.session_title || 'Not streaming'
    const category = channelData?.category?.name || 'No category'
    const channelName = channelData?.user?.username || channelData?.username || 'sweetflips'

    return (
        <AppLayout>
            {loading ? (
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kick-purple"></div>
                </div>
            ) : error ? (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                    <p className="text-red-400">Error: {error}</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Channel Information Card */}
                    <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6 shadow-sm">
                        <div className="flex items-center gap-4 mb-6">
                            {(channelData?.profile_picture || channelData?.user?.profile_picture) && (
                                <img
                                    src={channelData.profile_picture || channelData.user?.profile_picture}
                                    alt={channelData?.user?.username || channelData?.username || 'sweetflips'}
                                    width={64}
                                    height={64}
                                    className="w-16 h-16 rounded-full object-cover ring-2 ring-gray-200 dark:ring-kick-border"
                                />
                            )}
                            <div>
                                <h2 className="text-h3 font-semibold text-gray-900 dark:text-kick-text">
                                    {channelData?.user?.username || channelData?.username || 'sweetflips'}
                                </h2>
                                <p className="text-small text-gray-600 dark:text-kick-text-secondary">@{channelData?.slug || 'sweetflips'}</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                                <p className="text-small font-medium text-gray-600 dark:text-kick-text-secondary mb-1">Followers</p>
                                <p className="text-h4 font-semibold text-gray-900 dark:text-kick-text">
                                    {(channelData?.followers_count || 0).toLocaleString()}
                                </p>
                            </div>
                            <div>
                                <p className="text-small font-medium text-gray-600 dark:text-kick-text-secondary mb-1">Last Live</p>
                                <p className="text-h4 font-semibold text-gray-900 dark:text-kick-text">
                                    {channelData?.last_live_at
                                        ? (() => {
                                            const lastLive = new Date(channelData.last_live_at)
                                            const now = new Date()
                                            const diff = now.getTime() - lastLive.getTime()
                                            const days = Math.floor(diff / (1000 * 60 * 60 * 24))
                                            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
                                            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

                                            if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`
                                            if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`
                                            if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`
                                            return 'Just now'
                                        })()
                                        : 'Never'}
                                </p>
                            </div>
                            <div>
                                <p className="text-small font-medium text-gray-600 dark:text-kick-text-secondary mb-1">Category</p>
                                <p className="text-h4 font-semibold text-gray-900 dark:text-kick-text">
                                    {channelData?.category?.name || 'No category'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Status Cards */}
                    <div className={`grid grid-cols-1 md:grid-cols-3 ${isLive ? 'lg:grid-cols-4' : ''} gap-6`}>
                        {/* Stream Status Card */}
                        <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6 hover:bg-gray-50 dark:hover:bg-kick-surface-hover transition-colors shadow-sm">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-small font-medium text-gray-600 dark:text-kick-text-secondary">Stream Status</p>
                                    <p className={`text-h3 font-semibold mt-2 ${isLive ? 'text-kick-green' : 'text-gray-900 dark:text-kick-text-muted'}`}>
                                        {isLive ? 'LIVE' : 'OFFLINE'}
                                    </p>
                                </div>
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isLive ? 'bg-kick-green/20' : 'bg-kick-purple/20'}`}>
                                    {isLive ? (
                                        <svg className="w-6 h-6 text-kick-green" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                                        </svg>
                                    ) : (
                                        <svg className="w-6 h-6 text-kick-purple" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 012 0v4a1 1 0 11-2 0V7zM12 9a1 1 0 10-2 0v2a1 1 0 102 0V9z" clipRule="evenodd" />
                                        </svg>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Viewer Count Card */}
                        <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6 hover:bg-gray-50 dark:hover:bg-kick-surface-hover transition-colors shadow-sm">
                            <div className="flex items-center justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <p className="text-small font-medium text-gray-600 dark:text-kick-text-secondary">Viewers</p>
                                        {isLive && (
                                            <span className="flex items-center gap-1 text-xs font-semibold text-kick-green">
                                                <span className="w-1.5 h-1.5 bg-kick-green rounded-full animate-pulse"></span>
                                                LIVE
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-h3 font-semibold mt-2 text-gray-900 dark:text-kick-text">{viewerCount.toLocaleString('en-US')}</p>
                                </div>
                                <div className="w-12 h-12 rounded-full bg-kick-purple/20 flex items-center justify-center">
                                    <svg className="w-6 h-6 text-kick-purple" fill="currentColor" viewBox="0 0 20 20">
                                        <path d="M10 9a3 3 0 100-6 3 3 0 000 6zM3 18a7 7 0 1114 0H3z" />
                                    </svg>
                                </div>
                            </div>
                        </div>

                        {/* Category Card */}
                        <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6 hover:bg-gray-50 dark:hover:bg-kick-surface-hover transition-colors shadow-sm">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-small font-medium text-gray-600 dark:text-kick-text-secondary">Category</p>
                                    <p className="text-h4 font-semibold mt-2 text-gray-900 dark:text-kick-text truncate">{category}</p>
                                </div>
                                <div className="w-12 h-12 rounded-full bg-kick-purple/20 flex items-center justify-center">
                                    <svg className="w-6 h-6 text-kick-purple" fill="currentColor" viewBox="0 0 20 20">
                                        <path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z" />
                                    </svg>
                                </div>
                            </div>
                        </div>

                        {/* Stream Duration Card - only when live */}
                        {isLive && (
                            <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6 hover:bg-gray-50 dark:hover:bg-kick-surface-hover transition-colors shadow-sm">
                                <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <p className="text-small font-medium text-gray-600 dark:text-kick-text-secondary">Stream Duration</p>
                                            <span className="flex items-center gap-1 text-xs font-semibold text-kick-green">
                                                <span className="w-1.5 h-1.5 bg-kick-green rounded-full animate-pulse"></span>
                                                LIVE
                                            </span>
                                        </div>
                                        <p className="text-h3 font-semibold mt-2 text-kick-green">{streamDuration}</p>
                                    </div>
                                    <div className="w-12 h-12 rounded-full bg-kick-green/20 flex items-center justify-center">
                                        <svg className="w-6 h-6 text-kick-green" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Stream Stats Cards */}
                    {streamStats && isLive && (
                        <div className={`grid grid-cols-1 md:grid-cols-2 ${isAdmin ? 'lg:grid-cols-4' : 'lg:grid-cols-2'} gap-6`}>
                            {/* Total Messages Card */}
                            <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6 hover:bg-gray-50 dark:hover:bg-kick-surface-hover transition-colors shadow-sm">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-small font-medium text-gray-600 dark:text-kick-text-secondary">Total Messages</p>
                                        <p className="text-h3 font-semibold mt-2 text-gray-900 dark:text-kick-text">{streamStats.total_messages.toLocaleString()}</p>
                                    </div>
                                    <div className="w-12 h-12 rounded-full bg-kick-purple/20 flex items-center justify-center">
                                        <svg className="w-6 h-6 text-kick-purple" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                </div>
                            </div>

                            {/* Total Points Card */}
                            <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6 hover:bg-gray-50 dark:hover:bg-kick-surface-hover transition-colors shadow-sm">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-small font-medium text-gray-600 dark:text-kick-text-secondary">Total Points Earned</p>
                                        <p className="text-h3 font-semibold mt-2 text-kick-purple">{streamStats.total_points.toLocaleString()}</p>
                                    </div>
                                    <div className="w-12 h-12 rounded-full bg-kick-purple/20 flex items-center justify-center">
                                        <svg className="w-6 h-6 text-kick-purple" fill="currentColor" viewBox="0 0 20 20">
                                            <path d="M9.049 2.927c.765-1.36 2.722-1.36 3.486 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                        </svg>
                                    </div>
                                </div>
                            </div>

                            {/* Unique Chatters Card */}
                            <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6 hover:bg-gray-50 dark:hover:bg-kick-surface-hover transition-colors shadow-sm">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-small font-medium text-gray-600 dark:text-kick-text-secondary">Unique Chatters</p>
                                        <p className="text-h3 font-semibold mt-2 text-gray-900 dark:text-kick-text">{streamStats.unique_chatters.toLocaleString()}</p>
                                    </div>
                                    <div className="w-12 h-12 rounded-full bg-kick-green/20 flex items-center justify-center">
                                        <svg className="w-6 h-6 text-kick-green" fill="currentColor" viewBox="0 0 20 20">
                                            <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                                        </svg>
                                    </div>
                                </div>
                            </div>

                            {/* Engagement Rate Card */}
                            <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6 hover:bg-gray-50 dark:hover:bg-kick-surface-hover transition-colors shadow-sm">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-small font-medium text-gray-600 dark:text-kick-text-secondary">Chat Engagement</p>
                                        <p className="text-h3 font-semibold mt-2 text-kick-green">
                                            {viewerCount > 0
                                                ? `${((streamStats.unique_chatters / viewerCount) * 100).toFixed(1)}%`
                                                : '0%'}
                                        </p>
                                        <p className="text-xs text-gray-500 dark:text-kick-text-muted mt-1">
                                            {streamStats.unique_chatters} of {viewerCount.toLocaleString('en-US')} viewers
                                        </p>
                                    </div>
                                    <div className="w-12 h-12 rounded-full bg-kick-green/20 flex items-center justify-center">
                                        <svg className="w-6 h-6 text-kick-green" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Stream Info Card */}
                    <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6 shadow-sm">
                        <h3 className="text-h4 font-semibold text-gray-900 dark:text-kick-text mb-4">Stream Information</h3>
                        <div className="space-y-4">
                            <div>
                                <p className="text-small font-medium text-gray-600 dark:text-kick-text-secondary">Stream Title</p>
                                <p className="text-body text-gray-900 dark:text-kick-text mt-1">{streamTitle}</p>
                            </div>
                            {channelData?.channel_description && (
                                <div>
                                    <p className="text-small font-medium text-gray-600 dark:text-kick-text-secondary">Description</p>
                                    <p className="text-small text-gray-600 dark:text-kick-text-secondary mt-1">{channelData.channel_description}</p>
                                </div>
                            )}
                            {channelData?.banner_picture && (
                                <div>
                                    <Image
                                        src={channelData.banner_picture}
                                        alt="Channel Banner"
                                        width={800}
                                        height={200}
                                        className="rounded-lg w-full h-auto"
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Chat Frame and Leaderboard Side by Side */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Chat Frame */}
                        <div className="lg:col-span-2 bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6 shadow-sm">
                            <h3 className="text-h4 font-semibold text-gray-900 dark:text-kick-text mb-4">Live Chat</h3>
                            <div className="h-[600px]">
                                <ChatFrame
                                    chatroomId={channelData?.chatroom_id}
                                    broadcasterUserId={channelData?.broadcaster_user_id}
                                    slug={channelData?.slug}
                                    username={channelName}
                                />
                            </div>
                        </div>

                        {/* Stream Session Leaderboard - Only show when stream is live */}
                        {isLive && hasActiveSession && (
                            <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6 shadow-sm">
                                <h3 className="text-h4 font-semibold text-gray-900 dark:text-kick-text mb-4">
                                    🏆 Top Chatters This Stream
                                </h3>
                                {streamLeaderboard.length === 0 ? (
                                    <div className="text-center py-8 text-gray-700 dark:text-kick-text-muted">
                                        <p className="text-body">No chatters yet.</p>
                                        <p className="text-small mt-2">Be the first to chat!</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2 max-h-[600px] overflow-y-auto">
                                        {streamLeaderboard.map((entry) => (
                                            <div
                                                key={entry.user_id}
                                                className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-kick-surface-hover transition-all duration-300 ease-in-out"
                                            >
                                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                                    <span className="text-body font-semibold text-gray-600 dark:text-kick-text-secondary w-8 flex-shrink-0 transition-all duration-300">
                                                        {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}
                                                    </span>
                                                    {entry.profile_picture_url && !imageErrors.has(entry.user_id) ? (
                                                        <img
                                                            src={entry.profile_picture_url}
                                                            alt={entry.username}
                                                            width={32}
                                                            height={32}
                                                            className="w-8 h-8 rounded-full object-cover flex-shrink-0 ring-1 ring-gray-200 dark:ring-kick-border"
                                                            onError={() => {
                                                                setImageErrors(prev => new Set(prev).add(entry.user_id))
                                                            }}
                                                        />
                                                    ) : (
                                                        <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-kick-surface-hover flex items-center justify-center flex-shrink-0 ring-1 ring-gray-200 dark:ring-kick-border">
                                                            <span className="text-gray-600 dark:text-kick-text-secondary text-xs font-medium">
                                                                {entry.username.charAt(0).toUpperCase()}
                                                            </span>
                                                        </div>
                                                    )}
                                                    <span className="font-medium text-body text-gray-900 dark:text-kick-text truncate">
                                                        {entry.username}
                                                    </span>
                                                </div>
                                                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-semibold text-body text-kick-purple transition-all duration-300">
                                                            {entry.points_earned.toLocaleString()}
                                                        </span>
                                                        <span className="text-xs text-gray-500 dark:text-kick-text-muted">pts</span>
                                                    </div>
                                                    {(entry.messages_sent !== undefined || entry.emotes_used !== undefined) && (
                                                        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-kick-text-muted">
                                                            {entry.messages_sent !== undefined && (
                                                                <span>{entry.messages_sent.toLocaleString()} msgs</span>
                                                            )}
                                                            {entry.emotes_used !== undefined && entry.emotes_used > 0 && (
                                                                <span>• {entry.emotes_used.toLocaleString()} emotes</span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                        {!isLive && (
                            <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6 shadow-sm">
                                <div className="flex items-center gap-3 text-gray-600 dark:text-kick-text-secondary">
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 012 0v4a1 1 0 11-2 0V7zM12 9a1 1 0 10-2 0v2a1 1 0 102 0V9z" clipRule="evenodd" />
                                    </svg>
                                    <div>
                                        <p className="font-medium text-body">Stream is offline</p>
                                        <p className="text-xs text-gray-500 dark:text-kick-text-muted mt-1">
                                            The leaderboard will appear when the stream goes live. Points are only awarded during live streams.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Floating Redeem Code Button */}
            <button
                onClick={() => setShowPromoCodeModal(true)}
                className="fixed bottom-6 right-6 bg-gradient-to-r from-kick-purple to-purple-600 text-white px-5 py-3 rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105 flex items-center gap-2 font-medium z-40"
                title="Redeem Promo Code"
            >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                    <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
                </svg>
                <span>Redeem Code</span>
            </button>

            {/* Promo Code Modal */}
            <PromoCodeModal
                isOpen={showPromoCodeModal}
                onClose={() => setShowPromoCodeModal(false)}
                onSuccess={(points) => {
                    setToast({
                        message: `🎉 Success! You earned ${points.toLocaleString()} points!`,
                        type: 'success'
                    })
                    // Refresh channel data to update points display
                    fetchChannelData()
                }}
            />

            {/* Toast Notifications */}
            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast(null)}
                />
            )}
        </AppLayout>
    )
}
