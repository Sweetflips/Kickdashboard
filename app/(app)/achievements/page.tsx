'use client'

import { useToast } from '@/components/Toast'
import { ACHIEVEMENTS } from '@/lib/achievements'
import { getClientAccessToken } from '@/lib/auth-client'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

type AchievementRuntimeStatus = { unlocked: boolean; claimed: boolean }

const CATEGORY_INFO = {
    streams: { name: 'Streams', icon: '📺', color: 'bg-blue-500' },
    chat: { name: 'Chat', icon: '💬', color: 'bg-green-500' },
    leaderboard: { name: 'Leaderboard', icon: '🏆', color: 'bg-yellow-500' },
    community: { name: 'Community', icon: '👥', color: 'bg-purple-500' },
    special: { name: 'Special', icon: '⭐', color: 'bg-pink-500' },
}

export default function AchievementsPage() {
    const router = useRouter()
    const { showToast } = useToast()
    const [isConnected, setIsConnected] = useState(false)
    const [loading, setLoading] = useState(true)
    const [selectedCategory, setSelectedCategory] = useState<string>('all')
    const [userBalance, setUserBalance] = useState(0)
    const [achievementStatuses, setAchievementStatuses] = useState<Record<string, AchievementRuntimeStatus>>({})
    const [dismissedClaimBanner, setDismissedClaimBanner] = useState(false)

    useEffect(() => {
        checkAuth()
    }, [])

    useEffect(() => {
        if (isConnected) {
            fetchUserBalance()
            fetchAchievements()
        }
    }, [isConnected])

    const checkAuth = async () => {
        try {
            const token = getClientAccessToken()
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
            const token = getClientAccessToken()
            if (!token) return

            const response = await fetch(`/api/user?access_token=${encodeURIComponent(token)}`)
            if (response.ok) {
                const data = await response.json()
                if (data.id) {
                    const pointsResponse = await fetch(`/api/sweet-coins?kick_user_id=${data.id}`)
                    if (pointsResponse.ok) {
                        const pointsData = await pointsResponse.json()
                        setUserBalance(pointsData.total_sweet_coins || 0)
                    }
                }
            }
        } catch (error) {
            console.error('Error fetching user balance:', error)
        }
    }

    const fetchAchievements = async () => {
        try {
            const token = getClientAccessToken()
            if (!token) return

            const response = await fetch(`/api/achievements?access_token=${encodeURIComponent(token)}`)
            if (!response.ok) return

            const data = await response.json()
            if (Array.isArray(data.achievements)) {
                const statusMap: Record<string, AchievementRuntimeStatus> = {}
                for (const a of data.achievements) {
                    if (a && typeof a.id === 'string') {
                        statusMap[a.id] = { unlocked: !!a.unlocked, claimed: !!a.claimed }
                    }
                }
                setAchievementStatuses(statusMap)
            }
        } catch (error) {
            console.error('Error fetching achievements:', error)
        }
    }

    const claimAchievement = async (achievementId: string) => {
        try {
            const token = getClientAccessToken()
            if (!token) {
                showToast('Not authenticated', 'error')
                return
            }

            const res = await fetch(`/api/achievements/claim?access_token=${encodeURIComponent(token)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ achievementId }),
            })

            const payload = await res.json().catch(() => ({}))
            if (!res.ok) {
                showToast(payload?.error || 'Failed to claim achievement', 'error')
                return
            }

            if (payload?.alreadyClaimed) {
                showToast('Already claimed', 'info')
            } else {
                const pts = typeof payload?.sweetCoinsAwarded === 'number' ? payload.sweetCoinsAwarded : null
                const achievementName = ACHIEVEMENTS.find(a => a.id === achievementId)?.name || 'Achievement'
                showToast(
                    <div className="space-y-1">
                        <div className="text-base font-extrabold text-gray-900 dark:text-kick-text">
                            {achievementName}
                        </div>
                        {pts != null ? (
                            <div className="inline-flex items-center gap-2 text-base font-extrabold text-gray-900 dark:text-kick-text">
                                <span>{`+${pts.toLocaleString()}`}</span>
                                <Image src="/icons/Sweetflipscoin.png" alt="" width={18} height={18} className="w-[18px] h-[18px]" />
                                <span>Sweet Coins</span>
                            </div>
                        ) : (
                            <div className="text-base font-semibold text-gray-700 dark:text-kick-text-secondary">
                                Claimed
                            </div>
                        )}
                    </div>,
                    'success',
                    3000,
                    'Achievement Claimed'
                )
            }

            await Promise.all([fetchAchievements(), fetchUserBalance()])
        } catch (e) {
            console.error('Error claiming achievement:', e)
            showToast('Failed to claim achievement', 'error')
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

    const unlockedCount = ACHIEVEMENTS.filter(a => achievementStatuses[a.id]?.unlocked).length

    const totalEarnedPoints = ACHIEVEMENTS.reduce((sum, a) => {
        if (achievementStatuses[a.id]?.claimed) {
            return sum + a.reward
        }
        return sum
    }, 0)

    const claimableCount = ACHIEVEMENTS.filter((a) => achievementStatuses[a.id]?.unlocked && !achievementStatuses[a.id]?.claimed).length

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kick-purple"></div>
            </div>
        )
    }

    if (!isConnected) {
        return (
                <div className="max-w-2xl mx-auto text-center py-12">
                    <h2 className="text-h2 font-semibold text-gray-900 dark:text-kick-text mb-4">
                        Connect your Kick account to view achievements
                    </h2>
                    <p className="text-body text-gray-600 dark:text-kick-text-secondary mb-6">
                        Achievements track your progress and reward you with bonus Sweet Coins. Connect your account to get started!
                    </p>
                    <button
                        onClick={() => router.push('/login')}
                        className="px-6 py-3 bg-kick-purple text-white rounded-lg hover:bg-kick-purple-dark transition-colors"
                    >
                        Connect Kick
                    </button>
                </div>
        )
    }

    return (
            <div className="space-y-6">
                {/* Hero */}
                <div className="relative overflow-hidden bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 rounded-2xl p-8 text-white">
                    <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%23ffffff%22%20fill-opacity%3D%220.08%22%3E%3Cpath%20d%3D%22M36%2034v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6%2034v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6%204V0H4v4H0v2h4v4h2V6h4V4H6z%22%2F%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E')] opacity-50"></div>
                    <div className="relative z-10 text-center">
                        <h1 className="text-4xl md:text-5xl font-bold mb-4">
                            🏆 Achievements
                        </h1>
                        <p className="text-lg text-white/90 max-w-2xl mx-auto">
                            Complete challenges, unlock achievements, and earn bonus Sweet Coins! Track your progress and become the ultimate SweetFlips viewer.
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
                                <p className="text-h4 font-bold text-gray-900 dark:text-kick-text">{unlockedCount} / {ACHIEVEMENTS.length}</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
                                <Image
                                    src="/icons/Sweetflipscoin.png"
                                    alt=""
                                    width={20}
                                    height={20}
                                    className="w-5 h-5"
                                />
                            </div>
                            <div>
                                <p className="text-small text-gray-600 dark:text-kick-text-secondary">Sweet Coins Earned</p>
                                <p className="text-h4 font-bold text-kick-purple">{totalEarnedPoints.toLocaleString()}</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                                <span className="text-xl">💎</span>
                            </div>
                            <div>
                                <p className="text-small text-gray-600 dark:text-kick-text-secondary">Total Sweet Coins</p>
                                <p className="text-h4 font-bold text-gray-900 dark:text-kick-text">{totalPossiblePoints.toLocaleString()}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Claimable Banner */}
                {!dismissedClaimBanner && claimableCount > 0 && (
                    <div className="bg-kick-purple/10 dark:bg-kick-purple/20 border border-kick-purple/30 dark:border-kick-purple/50 rounded-xl p-4 flex items-start justify-between gap-4">
                        <div>
                            <p className="text-body font-semibold text-gray-900 dark:text-kick-text">
                                You have {claimableCount} achievement{claimableCount === 1 ? '' : 's'} ready to claim
                            </p>
                            <p className="text-small text-gray-600 dark:text-kick-text-secondary">
                                Claim them to add the Sweet Coins to your balance.
                            </p>
                        </div>
                        <button
                            onClick={() => setDismissedClaimBanner(true)}
                            className="px-3 py-2 text-sm font-medium rounded-lg bg-white/60 dark:bg-kick-surface border border-gray-200 dark:border-kick-border hover:bg-white dark:hover:bg-kick-surface-hover transition-colors"
                        >
                            Dismiss
                        </button>
                    </div>
                )}

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
                    {filteredAchievements.map((achievement) => {
                        const status = achievementStatuses[achievement.id]
                        const isUnlocked = !!status?.unlocked
                        const isClaimed = !!status?.claimed
                        return (
                        <div
                            key={achievement.id}
                            className={`bg-white dark:bg-kick-surface rounded-xl border p-5 transition-opacity ${
                                isUnlocked
                                    ? 'border-kick-green opacity-100'
                                    : 'border-gray-200 dark:border-kick-border opacity-75'
                            }`}
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
                                    {achievement.requirement && (
                                        <p className="text-small text-gray-600 dark:text-kick-text-secondary">
                                            {achievement.requirement}
                                        </p>
                                    )}
                                    {achievement.description && (
                                        <p className="text-xs text-gray-500 dark:text-kick-text-muted mb-3 mt-1">
                                            {achievement.description}
                                        </p>
                                    )}
                                    {!achievement.requirement && !achievement.description && (
                                        <div className="mb-3" />
                                    )}

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
                                                        title={`Tier ${tier.level}: ${tier.requirement} - ${tier.reward} Sweet Coins`}
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
                                            <Image
                                                src="/icons/Sweetflipscoin.png"
                                                alt=""
                                                width={16}
                                                height={16}
                                                className="w-4 h-4"
                                            />
                                            <span className="font-semibold">
                                                {achievement.reward.toLocaleString()}
                                            </span>
                                        </div>
                                        <span className={
                                            `px-2 py-1 text-xs font-medium rounded ${
                                                isClaimed
                                                    ? 'bg-kick-purple/10 text-kick-purple dark:bg-kick-purple/20 dark:text-kick-purple'
                                                    : isUnlocked
                                                    ? 'bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300'
                                                    : 'bg-gray-200 dark:bg-kick-dark text-gray-500 dark:text-kick-text-muted'
                                            }`}
                                        >
                                            {isClaimed ? 'Claimed' : isUnlocked ? 'Unlocked' : 'Locked'}
                                        </span>
                                    </div>

                                    {isUnlocked && !isClaimed && (
                                        <button
                                            onClick={() => claimAchievement(achievement.id)}
                                            className="mt-3 inline-flex items-center justify-center px-4 py-2 rounded-lg bg-kick-green text-white text-sm font-extrabold tracking-tight shadow-[0_10px_30px_rgba(34,197,94,0.25)] ring-1 ring-white/10 hover:bg-kick-green/90 hover:shadow-[0_12px_34px_rgba(34,197,94,0.30)] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-kick-green/60"
                                        >
                                            <span className="mr-1">Claim +{achievement.reward.toLocaleString()}</span>
                                            <Image
                                                src="/icons/Sweetflipscoin.png"
                                                alt=""
                                                width={14}
                                                height={14}
                                                className="w-3.5 h-3.5"
                                            />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )})}
                </div>

                {/* Info Section */}
                <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-kick-surface dark:to-kick-dark rounded-xl border border-gray-200 dark:border-kick-border p-6 text-center">
                    <h3 className="text-h4 font-semibold text-gray-900 dark:text-kick-text mb-2">
                        How achievements work
                    </h3>
                    <p className="text-body text-gray-600 dark:text-kick-text-secondary mb-4">
                        Earn Sweet Coins by watching streams, chatting, joining raffles and being active in the community. More achievements will be added over time.
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
    )
}
