'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/AppLayout'

interface Achievement {
    id: string
    name: string
    description: string
    icon: string
    reward: number
    category: 'streams' | 'chat' | 'leaderboard' | 'community' | 'special'
    tiers?: {
        level: number
        requirement: number
        reward: number
        unlocked?: boolean
    }[]
    progress?: number
    maxProgress?: number
    unlocked?: boolean
}

const ACHIEVEMENTS: Achievement[] = [
    // Stream Achievements
    {
        id: 'stream-starter',
        name: 'Stream Starter',
        description: 'Watch your first SweetFlips stream',
        icon: '🎬',
        reward: 50,
        category: 'streams',
        unlocked: false,
    },
    {
        id: 'dedicated-viewer',
        name: 'Dedicated Viewer',
        description: 'Watch streams multiple days in a row',
        icon: '📺',
        reward: 100,
        category: 'streams',
        tiers: [
            { level: 1, requirement: 3, reward: 50, unlocked: false },
            { level: 2, requirement: 7, reward: 100, unlocked: false },
            { level: 3, requirement: 14, reward: 250, unlocked: false },
            { level: 4, requirement: 30, reward: 500, unlocked: false },
        ],
        progress: 0,
        maxProgress: 30,
    },
    {
        id: 'stream-veteran',
        name: 'Stream Veteran',
        description: 'Watch a total number of streams',
        icon: '🏅',
        reward: 200,
        category: 'streams',
        tiers: [
            { level: 1, requirement: 10, reward: 100, unlocked: false },
            { level: 2, requirement: 25, reward: 200, unlocked: false },
            { level: 3, requirement: 50, reward: 400, unlocked: false },
            { level: 4, requirement: 100, reward: 1000, unlocked: false },
        ],
        progress: 0,
        maxProgress: 100,
    },
    {
        id: 'night-owl',
        name: 'Night Owl',
        description: 'Watch 5 late night streams (after midnight)',
        icon: '🦉',
        reward: 150,
        category: 'streams',
        progress: 0,
        maxProgress: 5,
    },

    // Chat Achievements
    {
        id: 'first-words',
        name: 'First Words',
        description: 'Send your first chat message',
        icon: '💬',
        reward: 25,
        category: 'chat',
        unlocked: false,
    },
    {
        id: 'chatterbox',
        name: 'Chatterbox',
        description: 'Send messages during streams',
        icon: '🗣️',
        reward: 100,
        category: 'chat',
        tiers: [
            { level: 1, requirement: 100, reward: 50, unlocked: false },
            { level: 2, requirement: 500, reward: 100, unlocked: false },
            { level: 3, requirement: 1000, reward: 200, unlocked: false },
            { level: 4, requirement: 5000, reward: 500, unlocked: false },
        ],
        progress: 0,
        maxProgress: 5000,
    },
    {
        id: 'emote-master',
        name: 'Emote Master',
        description: 'Use emotes in your messages',
        icon: '😎',
        reward: 75,
        category: 'chat',
        tiers: [
            { level: 1, requirement: 50, reward: 25, unlocked: false },
            { level: 2, requirement: 200, reward: 75, unlocked: false },
            { level: 3, requirement: 500, reward: 150, unlocked: false },
            { level: 4, requirement: 1000, reward: 300, unlocked: false },
        ],
        progress: 0,
        maxProgress: 1000,
    },

    // Leaderboard Achievements
    {
        id: 'top-chatter',
        name: 'Top Chatter',
        description: 'Finish in the top 10 on the stream leaderboard',
        icon: '🏆',
        reward: 100,
        category: 'leaderboard',
        tiers: [
            { level: 1, requirement: 1, reward: 50, unlocked: false },
            { level: 2, requirement: 5, reward: 100, unlocked: false },
            { level: 3, requirement: 10, reward: 200, unlocked: false },
            { level: 4, requirement: 25, reward: 500, unlocked: false },
        ],
        progress: 0,
        maxProgress: 25,
    },
    {
        id: 'champion',
        name: 'Champion',
        description: 'Finish #1 on the stream leaderboard',
        icon: '👑',
        reward: 250,
        category: 'leaderboard',
        tiers: [
            { level: 1, requirement: 1, reward: 100, unlocked: false },
            { level: 2, requirement: 5, reward: 250, unlocked: false },
            { level: 3, requirement: 10, reward: 500, unlocked: false },
            { level: 4, requirement: 25, reward: 1500, unlocked: false },
        ],
        progress: 0,
        maxProgress: 25,
    },
    {
        id: 'podium-finisher',
        name: 'Podium Finisher',
        description: 'Finish in top 3 on the stream leaderboard',
        icon: '🥇',
        reward: 150,
        category: 'leaderboard',
        tiers: [
            { level: 1, requirement: 3, reward: 75, unlocked: false },
            { level: 2, requirement: 10, reward: 150, unlocked: false },
            { level: 3, requirement: 25, reward: 350, unlocked: false },
            { level: 4, requirement: 50, reward: 750, unlocked: false },
        ],
        progress: 0,
        maxProgress: 50,
    },

    // Community Achievements
    {
        id: 'social-butterfly',
        name: 'Social Butterfly',
        description: 'Connect Discord and Telegram accounts',
        icon: '🦋',
        reward: 100,
        category: 'community',
        unlocked: false,
    },
    {
        id: 'raffle-participant',
        name: 'Raffle Participant',
        description: 'Enter raffles',
        icon: '🎟️',
        reward: 50,
        category: 'community',
        tiers: [
            { level: 1, requirement: 1, reward: 25, unlocked: false },
            { level: 2, requirement: 5, reward: 50, unlocked: false },
            { level: 3, requirement: 10, reward: 100, unlocked: false },
            { level: 4, requirement: 25, reward: 250, unlocked: false },
        ],
        progress: 0,
        maxProgress: 25,
    },
    {
        id: 'lucky-winner',
        name: 'Lucky Winner',
        description: 'Win a raffle',
        icon: '🍀',
        reward: 200,
        category: 'community',
        unlocked: false,
    },

    // Special Achievements
    {
        id: 'og-viewer',
        name: 'OG Viewer',
        description: 'Be one of the first 100 dashboard users',
        icon: '⭐',
        reward: 500,
        category: 'special',
        unlocked: false,
    },
    {
        id: 'subscriber',
        name: 'Supporter',
        description: 'Subscribe to SweetFlips on Kick',
        icon: '💎',
        reward: 300,
        category: 'special',
        unlocked: false,
    },
    {
        id: 'point-millionaire',
        name: 'Point Millionaire',
        description: 'Accumulate 10,000 total points',
        icon: '💰',
        reward: 1000,
        category: 'special',
        tiers: [
            { level: 1, requirement: 1000, reward: 100, unlocked: false },
            { level: 2, requirement: 5000, reward: 250, unlocked: false },
            { level: 3, requirement: 10000, reward: 500, unlocked: false },
            { level: 4, requirement: 50000, reward: 2000, unlocked: false },
        ],
        progress: 0,
        maxProgress: 50000,
    },
]

const CATEGORY_INFO = {
    streams: { name: 'Streams', icon: '📺', color: 'bg-blue-500' },
    chat: { name: 'Chat', icon: '💬', color: 'bg-green-500' },
    leaderboard: { name: 'Leaderboard', icon: '🏆', color: 'bg-yellow-500' },
    community: { name: 'Community', icon: '👥', color: 'bg-purple-500' },
    special: { name: 'Special', icon: '⭐', color: 'bg-pink-500' },
}

export default function AchievementsPage() {
    const router = useRouter()
    const [isConnected, setIsConnected] = useState(false)
    const [loading, setLoading] = useState(true)
    const [selectedCategory, setSelectedCategory] = useState<string>('all')
    const [userBalance, setUserBalance] = useState(0)

    useEffect(() => {
        checkAuth()
    }, [])

    useEffect(() => {
        if (isConnected) {
            fetchUserBalance()
        }
    }, [isConnected])

    const checkAuth = async () => {
        try {
            const token = localStorage.getItem('kick_access_token')
            if (!token) {
                setIsConnected(false)
                setLoading(false)
                return
            }

            const response = await fetch(`/api/user?access_token=${encodeURIComponent(token)}`)
            if (response.ok) {
                setIsConnected(true)
            } else {
                setIsConnected(false)
            }
        } catch (error) {
            console.error('Error checking auth:', error)
            setIsConnected(false)
        } finally {
            setLoading(false)
        }
    }

    const fetchUserBalance = async () => {
        try {
            const token = localStorage.getItem('kick_access_token')
            if (!token) return

            const response = await fetch(`/api/user?access_token=${encodeURIComponent(token)}`)
            if (response.ok) {
                const data = await response.json()
                if (data.id) {
                    const pointsResponse = await fetch(`/api/points?kick_user_id=${data.id}`)
                    if (pointsResponse.ok) {
                        const pointsData = await pointsResponse.json()
                        setUserBalance(pointsData.total_points || 0)
                    }
                }
            }
        } catch (error) {
            console.error('Error fetching user balance:', error)
        }
    }

    const filteredAchievements = selectedCategory === 'all'
        ? ACHIEVEMENTS
        : ACHIEVEMENTS.filter(a => a.category === selectedCategory)

    const totalPossiblePoints = ACHIEVEMENTS.reduce((sum, a) => {
        if (a.tiers) {
            return sum + a.tiers.reduce((tierSum, t) => tierSum + t.reward, 0)
        }
        return sum + a.reward
    }, 0)

    if (loading) {
        return (
            <AppLayout>
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kick-purple"></div>
                </div>
            </AppLayout>
        )
    }

    if (!isConnected) {
        return (
            <AppLayout>
                <div className="max-w-2xl mx-auto text-center py-12">
                    <h2 className="text-h2 font-semibold text-gray-900 dark:text-kick-text mb-4">
                        Connect your Kick account to view achievements
                    </h2>
                    <p className="text-body text-gray-600 dark:text-kick-text-secondary mb-6">
                        Achievements track your progress and reward you with bonus points. Connect your account to get started!
                    </p>
                    <button
                        onClick={() => router.push('/login')}
                        className="px-6 py-3 bg-kick-purple text-white rounded-lg hover:bg-kick-purple-dark transition-colors"
                    >
                        Connect Kick
                    </button>
                </div>
            </AppLayout>
        )
    }

    return (
        <AppLayout>
            <div className="space-y-6">
                {/* Coming Soon Banner */}
                <div className="relative overflow-hidden bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 rounded-2xl p-8 text-white">
                    <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%23ffffff%22%20fill-opacity%3D%220.08%22%3E%3Cpath%20d%3D%22M36%2034v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6%2034v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6%204V0H4v4H0v2h4v4h2V6h4V4H6z%22%2F%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E')] opacity-50"></div>
                    <div className="relative z-10 text-center">
                        <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-4 py-2 mb-4">
                            <span className="relative flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-300 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-300"></span>
                            </span>
                            <span className="text-sm font-medium">Coming Soon</span>
                        </div>
                        <h1 className="text-4xl md:text-5xl font-bold mb-4">
                            🏆 Achievements
                        </h1>
                        <p className="text-lg text-white/90 max-w-2xl mx-auto">
                            Complete challenges, unlock achievements, and earn bonus points! Track your progress and become the ultimate SweetFlips viewer.
                        </p>
                    </div>
                    <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
                    <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
                </div>

                {/* Stats Overview */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-kick-purple/20 flex items-center justify-center">
                                <span className="text-xl">🏆</span>
                            </div>
                            <div>
                                <p className="text-small text-gray-600 dark:text-kick-text-secondary">Total Achievements</p>
                                <p className="text-h4 font-bold text-gray-900 dark:text-kick-text">{ACHIEVEMENTS.length}</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                                <span className="text-xl">✅</span>
                            </div>
                            <div>
                                <p className="text-small text-gray-600 dark:text-kick-text-secondary">Unlocked</p>
                                <p className="text-h4 font-bold text-gray-900 dark:text-kick-text">0 / {ACHIEVEMENTS.length}</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
                                <span className="text-xl">⭐</span>
                            </div>
                            <div>
                                <p className="text-small text-gray-600 dark:text-kick-text-secondary">Points Earned</p>
                                <p className="text-h4 font-bold text-kick-purple">0</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                                <span className="text-xl">💎</span>
                            </div>
                            <div>
                                <p className="text-small text-gray-600 dark:text-kick-text-secondary">Total Available</p>
                                <p className="text-h4 font-bold text-gray-900 dark:text-kick-text">{totalPossiblePoints.toLocaleString()}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Category Filter */}
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => setSelectedCategory('all')}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                            selectedCategory === 'all'
                                ? 'bg-kick-purple text-white'
                                : 'bg-white dark:bg-kick-surface border border-gray-200 dark:border-kick-border text-gray-700 dark:text-kick-text-secondary hover:bg-gray-50 dark:hover:bg-kick-surface-hover'
                        }`}
                    >
                        All
                    </button>
                    {Object.entries(CATEGORY_INFO).map(([key, info]) => (
                        <button
                            key={key}
                            onClick={() => setSelectedCategory(key)}
                            className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                                selectedCategory === key
                                    ? 'bg-kick-purple text-white'
                                    : 'bg-white dark:bg-kick-surface border border-gray-200 dark:border-kick-border text-gray-700 dark:text-kick-text-secondary hover:bg-gray-50 dark:hover:bg-kick-surface-hover'
                            }`}
                        >
                            <span>{info.icon}</span>
                            <span>{info.name}</span>
                        </button>
                    ))}
                </div>

                {/* Achievements Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredAchievements.map((achievement) => (
                        <div
                            key={achievement.id}
                            className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-5 opacity-75"
                        >
                            <div className="flex items-start gap-4">
                                <div className="w-14 h-14 rounded-xl bg-gray-100 dark:bg-kick-dark flex items-center justify-center text-3xl flex-shrink-0">
                                    {achievement.icon}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className="text-body font-semibold text-gray-900 dark:text-kick-text truncate">
                                            {achievement.name}
                                        </h3>
                                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${CATEGORY_INFO[achievement.category].color} text-white`}>
                                            {CATEGORY_INFO[achievement.category].name}
                                        </span>
                                    </div>
                                    <p className="text-small text-gray-600 dark:text-kick-text-secondary mb-3">
                                        {achievement.description}
                                    </p>

                                    {/* Progress bar for tiered achievements */}
                                    {achievement.tiers && (
                                        <div className="mb-3">
                                            <div className="flex justify-between text-xs text-gray-500 dark:text-kick-text-muted mb-1">
                                                <span>Progress</span>
                                                <span>0 / {achievement.tiers[0].requirement}</span>
                                            </div>
                                            <div className="h-2 bg-gray-200 dark:bg-kick-dark rounded-full overflow-hidden">
                                                <div className="h-full bg-gray-400 rounded-full" style={{ width: '0%' }}></div>
                                            </div>
                                            <div className="flex gap-1 mt-2">
                                                {achievement.tiers.map((tier, idx) => (
                                                    <div
                                                        key={idx}
                                                        className="flex-1 text-center"
                                                        title={`Tier ${tier.level}: ${tier.requirement} - ${tier.reward} pts`}
                                                    >
                                                        <div className={`h-1 rounded-full ${tier.unlocked ? 'bg-kick-green' : 'bg-gray-300 dark:bg-kick-border'}`}></div>
                                                        <span className="text-xs text-gray-400 dark:text-kick-text-muted">T{tier.level}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Reward */}
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1 text-kick-purple">
                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                                <path d="M9.049 2.927c.765-1.36 2.722-1.36 3.486 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                            </svg>
                                            <span className="font-semibold">
                                                {achievement.tiers
                                                    ? `Up to ${achievement.tiers.reduce((sum, t) => sum + t.reward, 0).toLocaleString()}`
                                                    : achievement.reward.toLocaleString()
                                                } pts
                                            </span>
                                        </div>
                                        <span className="px-2 py-1 text-xs font-medium rounded bg-gray-200 dark:bg-kick-dark text-gray-500 dark:text-kick-text-muted">
                                            Locked
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Featured Achievements */}
                <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6">
                    <h2 className="text-h3 font-semibold text-gray-900 dark:text-kick-text mb-6">
                        Featured Challenges
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Streak Challenge */}
                        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-5 border border-blue-200 dark:border-blue-800">
                            <div className="flex items-center gap-3 mb-3">
                                <span className="text-3xl">🔥</span>
                                <div>
                                    <h3 className="text-h4 font-semibold text-gray-900 dark:text-kick-text">Watch Streak</h3>
                                    <p className="text-small text-gray-600 dark:text-kick-text-secondary">Watch 10 streams in a row</p>
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1 text-kick-purple font-semibold">
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                        <path d="M9.049 2.927c.765-1.36 2.722-1.36 3.486 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                    </svg>
                                    +500 points
                                </div>
                                <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-sm font-medium rounded-full">
                                    0/10 streams
                                </span>
                            </div>
                        </div>

                        {/* Leaderboard Champion */}
                        <div className="bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 rounded-xl p-5 border border-yellow-200 dark:border-yellow-800">
                            <div className="flex items-center gap-3 mb-3">
                                <span className="text-3xl">👑</span>
                                <div>
                                    <h3 className="text-h4 font-semibold text-gray-900 dark:text-kick-text">Leaderboard Legend</h3>
                                    <p className="text-small text-gray-600 dark:text-kick-text-secondary">Finish #1 on 10 streams</p>
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1 text-kick-purple font-semibold">
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                        <path d="M9.049 2.927c.765-1.36 2.722-1.36 3.486 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                    </svg>
                                    +1,500 points
                                </div>
                                <span className="px-3 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 text-sm font-medium rounded-full">
                                    0/10 wins
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Info Section */}
                <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-kick-surface dark:to-kick-dark rounded-xl border border-gray-200 dark:border-kick-border p-6 text-center">
                    <h3 className="text-h4 font-semibold text-gray-900 dark:text-kick-text mb-2">
                        Achievements are coming soon!
                    </h3>
                    <p className="text-body text-gray-600 dark:text-kick-text-secondary mb-4">
                        Keep watching streams and chatting to build up your stats. When achievements launch, your progress will be tracked!
                    </p>
                    <a
                        href="https://kick.com/sweetflips"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-kick-green text-white rounded-lg hover:bg-kick-green/90 transition-colors font-medium"
                    >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                            <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                        </svg>
                        Watch on Kick
                    </a>
                </div>
            </div>
        </AppLayout>
    )
}
