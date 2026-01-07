'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

interface ReferralTier {
    id: string
    name: string
    requiredPoints: number
    yourReward: number
    theirReward: number
    icon: string
    color: string
}

interface ReferralStats {
    totalReferrals: number
    activeReferrals: number
    totalEarned: number
    pendingRewards: number
}

const REFERRAL_TIERS: ReferralTier[] = [
    {
        id: 'starter',
        name: 'Getting Started',
        requiredPoints: 100,
        yourReward: 25,
        theirReward: 25,
        icon: '🌱',
        color: 'from-green-400 to-emerald-500',
    },
    {
        id: 'active',
        name: 'Active Chatter',
        requiredPoints: 500,
        yourReward: 75,
        theirReward: 50,
        icon: '💬',
        color: 'from-blue-400 to-cyan-500',
    },
    {
        id: 'dedicated',
        name: 'Dedicated Viewer',
        requiredPoints: 1000,
        yourReward: 150,
        theirReward: 100,
        icon: '⭐',
        color: 'from-yellow-400 to-amber-500',
    },
    {
        id: 'superfan',
        name: 'Super Fan',
        requiredPoints: 2500,
        yourReward: 300,
        theirReward: 200,
        icon: '🔥',
        color: 'from-orange-400 to-red-500',
    },
    {
        id: 'legend',
        name: 'Community Legend',
        requiredPoints: 5000,
        yourReward: 500,
        theirReward: 350,
        icon: '👑',
        color: 'from-purple-400 to-pink-500',
    },
]

const MOCK_STATS: ReferralStats = {
    totalReferrals: 0,
    activeReferrals: 0,
    totalEarned: 0,
    pendingRewards: 0,
}

export default function ReferralsPage() {
    const router = useRouter()
    const [isConnected, setIsConnected] = useState(false)
    const [loading, setLoading] = useState(true)
    const [userData, setUserData] = useState<{ username?: string; id?: number } | null>(null)
    const [copied, setCopied] = useState(false)
    const [stats, setStats] = useState<{ totalReferrals: number; activeReferrals: number; totalEarned: number; pendingRewards: number } | null>(null)
    const [referrals, setReferrals] = useState<any[]>([])
    const [loadingStats, setLoadingStats] = useState(false)

    useEffect(() => {
        checkAuth()
    }, [])

    useEffect(() => {
        if (isConnected) {
            fetchStats()
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
                const data = await response.json()
                setUserData(data)
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

    const fetchStats = async () => {
        setLoadingStats(true)
        try {
            const response = await fetch('/api/referrals/stats')
            if (response.ok) {
                const data = await response.json()
                setStats(data.stats)
                setReferrals(data.referrals)
            }
        } catch (error) {
            console.error('Error fetching stats:', error)
        } finally {
            setLoadingStats(false)
        }
    }

    const referralCode = userData?.username?.toUpperCase() || 'YOURCODE'
    const referralLink = `https://kickdashboard.com/signup?ref=${referralCode}`

    const handleCopyCode = () => {
        navigator.clipboard.writeText(referralCode)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const handleCopyLink = () => {
        navigator.clipboard.writeText(referralLink)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const totalPossibleReward = REFERRAL_TIERS.reduce((sum, tier) => sum + tier.yourReward, 0)
    const displayStats = stats || MOCK_STATS
    const activeReferrals = referrals.filter(r => r.points > 0).length

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
                    Connect your Kick account to access referrals
                </h2>
                <p className="text-body text-gray-600 dark:text-kick-text-secondary mb-6">
                    Invite friends and earn bonus Sweet Coins when they become active members of the community!
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
                {/* Referral Code Section */}
                <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6">
                    <h2 className="text-h3 font-semibold text-gray-900 dark:text-kick-text mb-4">
                        Your Referral Code
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Code */}
                        <div>
                            <label className="block text-small font-medium text-gray-600 dark:text-kick-text-secondary mb-2">
                                Share this code
                            </label>
                            <div className="flex items-center gap-2">
                                <div className="flex-1 px-4 py-3 bg-gray-100 dark:bg-kick-dark rounded-lg font-mono text-lg font-bold text-gray-900 dark:text-kick-text text-center">
                                    {referralCode}
                                </div>
                                <button
                                    onClick={handleCopyCode}
                                    className="px-4 py-3 bg-kick-purple text-white rounded-lg font-medium hover:bg-kick-purple-dark transition-colors"
                                >
                                    {copied ? 'Copied!' : 'Copy'}
                                </button>
                            </div>
                        </div>
                        {/* Link */}
                        <div>
                            <label className="block text-small font-medium text-gray-600 dark:text-kick-text-secondary mb-2">
                                Or share this link
                            </label>
                            <div className="flex items-center gap-2">
                                <div className="flex-1 px-4 py-3 bg-gray-100 dark:bg-kick-dark rounded-lg text-sm text-gray-600 dark:text-kick-text-secondary truncate">
                                    {referralLink}
                                </div>
                                <button
                                    onClick={handleCopyLink}
                                    className="px-4 py-3 bg-kick-purple text-white rounded-lg font-medium hover:bg-kick-purple-dark transition-colors"
                                >
                                    {copied ? 'Copied!' : 'Copy'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Stats Overview */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                                <span className="text-xl">👥</span>
                            </div>
                            <div>
                                <p className="text-small text-gray-600 dark:text-kick-text-secondary">Total Referrals</p>
                                <p className="text-h4 font-bold text-gray-900 dark:text-kick-text">{displayStats.totalReferrals}</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                                <span className="text-xl">✅</span>
                            </div>
                            <div>
                                <p className="text-small text-gray-600 dark:text-kick-text-secondary">Active</p>
                                <p className="text-h4 font-bold text-gray-900 dark:text-kick-text">{activeReferrals}</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-kick-purple/20 flex items-center justify-center">
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
                                <p className="text-h4 font-bold text-kick-purple">{displayStats.totalEarned}</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
                                <span className="text-xl">⏳</span>
                            </div>
                            <div>
                                <p className="text-small text-gray-600 dark:text-kick-text-secondary">Pending</p>
                                <p className="text-h4 font-bold text-gray-900 dark:text-kick-text">{displayStats.pendingRewards}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* How It Works */}
                <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6">
                    <h2 className="text-h3 font-semibold text-gray-900 dark:text-kick-text mb-6">
                        How It Works
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div className="text-center">
                            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center mx-auto mb-4 text-white text-2xl font-bold">
                                1
                            </div>
                            <h3 className="text-h4 font-semibold text-gray-900 dark:text-kick-text mb-2">
                                Share Your Code
                            </h3>
                            <p className="text-small text-gray-600 dark:text-kick-text-secondary">
                                Give your unique referral code to friends who want to join
                            </p>
                        </div>
                        <div className="text-center">
                            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-cyan-500 flex items-center justify-center mx-auto mb-4 text-white text-2xl font-bold">
                                2
                            </div>
                            <h3 className="text-h4 font-semibold text-gray-900 dark:text-kick-text mb-2">
                                They Sign Up
                            </h3>
                            <p className="text-small text-gray-600 dark:text-kick-text-secondary">
                                Your friend connects their Kick account using your code
                            </p>
                        </div>
                        <div className="text-center">
                            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center mx-auto mb-4 text-white text-2xl font-bold">
                                3
                            </div>
                            <h3 className="text-h4 font-semibold text-gray-900 dark:text-kick-text mb-2">
                                They Earn Sweet Coins
                            </h3>
                            <p className="text-small text-gray-600 dark:text-kick-text-secondary">
                                As they chat and participate in streams, they earn Sweet Coins
                            </p>
                        </div>
                        <div className="text-center">
                            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center mx-auto mb-4 text-white text-2xl font-bold">
                                4
                            </div>
                            <h3 className="text-h4 font-semibold text-gray-900 dark:text-kick-text mb-2">
                                You Both Get Rewards
                            </h3>
                            <p className="text-small text-gray-600 dark:text-kick-text-secondary">
                                Hit milestones and you both earn bonus Sweet Coins!
                            </p>
                        </div>
                    </div>
                </div>

                {/* Reward Tiers */}
                <div>
                    <h2 className="text-h3 font-semibold text-gray-900 dark:text-kick-text mb-4">
                        Reward Milestones
                    </h2>
                    <p className="text-body text-gray-600 dark:text-kick-text-secondary mb-6">
                        Earn rewards as your referrals reach these Sweet Coin milestones. You can earn up to <span className="font-semibold text-kick-purple">{totalPossibleReward} Sweet Coins</span> per referral!
                    </p>
                    <div className="space-y-4">
                        {REFERRAL_TIERS.map((tier, index) => (
                            <div
                                key={tier.id}
                                className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-5 opacity-75"
                            >
                                <div className="flex items-center gap-4">
                                    {/* Icon */}
                                    <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${tier.color} flex items-center justify-center text-3xl flex-shrink-0`}>
                                        {tier.icon}
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="text-body font-semibold text-gray-900 dark:text-kick-text">
                                                {tier.name}
                                            </h3>
                                            <span className="px-2 py-0.5 bg-gray-100 dark:bg-kick-dark text-gray-600 dark:text-kick-text-secondary text-xs font-medium rounded-full">
                                                Tier {index + 1}
                                            </span>
                                        </div>
                                        <p className="text-small text-gray-600 dark:text-kick-text-secondary">
                                            When your referral earns <span className="font-semibold">{tier.requiredPoints.toLocaleString()} Sweet Coins</span>
                                        </p>
                                    </div>

                                    {/* Rewards */}
                                    <div className="flex items-center gap-6 flex-shrink-0">
                                        <div className="text-center">
                                            <p className="text-xs text-gray-500 dark:text-kick-text-muted mb-1">You get</p>
                                            <div className="flex items-center gap-1 text-kick-purple font-bold">
                                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                                    <path d="M9.049 2.927c.765-1.36 2.722-1.36 3.486 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                                </svg>
                                                +{tier.yourReward}
                                            </div>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-xs text-gray-500 dark:text-kick-text-muted mb-1">They get</p>
                                            <div className="flex items-center gap-1 text-kick-green font-bold">
                                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                                    <path d="M9.049 2.927c.765-1.36 2.722-1.36 3.486 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                                </svg>
                                                +{tier.theirReward}
                                            </div>
                                        </div>
                                        <div className="w-20">
                                            <span className="px-3 py-1 bg-gray-200 dark:bg-kick-dark text-gray-500 dark:text-kick-text-muted text-sm font-medium rounded-full">
                                                Locked
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Progress bar placeholder */}
                                <div className="mt-4">
                                    <div className="h-2 bg-gray-200 dark:bg-kick-dark rounded-full overflow-hidden">
                                        <div className="h-full bg-gray-400 rounded-full" style={{ width: '0%' }}></div>
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-kick-text-muted mt-1 text-right">
                                        0 / {tier.requiredPoints.toLocaleString()} Sweet Coins
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Your Referrals Table */}
                <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6">
                    <h2 className="text-h3 font-semibold text-gray-900 dark:text-kick-text mb-4">
                        Your Referrals
                    </h2>
                    {loadingStats ? (
                        <div className="flex items-center justify-center h-64">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kick-purple"></div>
                        </div>
                    ) : referrals.length === 0 ? (
                        <div className="text-center py-12 text-gray-500 dark:text-kick-text-muted">
                            <span className="text-4xl mb-4 block">👥</span>
                            <p className="text-body font-medium mb-2">No referrals yet</p>
                            <p className="text-small">Share your code with friends to start earning rewards!</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="border-b border-gray-200 dark:border-kick-border">
                                    <tr>
                                        <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-kick-text">Friend</th>
                                        <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-kick-text">Sweet Coins</th>
                                        <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-kick-text">Tiers Reached</th>
                                        <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-kick-text">Earned</th>
                                        <th className="text-left py-3 px-4 font-semibold text-gray-900 dark:text-kick-text">Referred</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {referrals.map((ref: any) => (
                                        <tr key={ref.id} className="border-b border-gray-200 dark:border-kick-border hover:bg-gray-50 dark:hover:bg-kick-dark/50 transition-colors">
                                            <td className="py-3 px-4">
                                                <div className="flex items-center gap-2">
                                                    {ref.referee.profilePicture && (
                                                        <img src={ref.referee.profilePicture} alt={ref.referee.username} className="w-8 h-8 rounded-full" />
                                                    )}
                                                    <span className="font-medium text-gray-900 dark:text-kick-text">{ref.referee.username}</span>
                                                </div>
                                            </td>
                                            <td className="py-3 px-4 text-gray-600 dark:text-kick-text-secondary">{ref.points.toLocaleString()}</td>
                                            <td className="py-3 px-4">
                                                <div className="flex gap-1 flex-wrap">
                                                    {ref.completedTiers.length === 0 ? (
                                                        <span className="text-xs text-gray-500 dark:text-kick-text-muted">-</span>
                                                    ) : (
                                                        ref.completedTiers.map((tier: string) => {
                                                            const tierData = REFERRAL_TIERS.find(t => t.id === tier)
                                                            return (
                                                                <span key={tier} className="px-2 py-1 bg-kick-purple/20 text-kick-purple dark:text-kick-purple text-xs font-medium rounded">
                                                                    {tierData?.icon}
                                                                </span>
                                                            )
                                                        })
                                                    )}
                                                </div>
                                            </td>
                                            <td className="py-3 px-4 font-semibold text-kick-purple">+{ref.earnedPoints}</td>
                                            <td className="py-3 px-4 text-sm text-gray-600 dark:text-kick-text-secondary">
                                                {new Date(ref.referredAt).toLocaleDateString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* FAQ Section */}
                <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6">
                    <h2 className="text-h3 font-semibold text-gray-900 dark:text-kick-text mb-4">
                        Frequently Asked Questions
                    </h2>
                    <div className="space-y-4">
                        <div>
                            <h3 className="text-body font-semibold text-gray-900 dark:text-kick-text mb-1">
                                How many people can I refer?
                            </h3>
                            <p className="text-small text-gray-600 dark:text-kick-text-secondary">
                                There&apos;s no limit! Refer as many friends as you want and earn rewards for each one.
                            </p>
                        </div>
                        <div>
                            <h3 className="text-body font-semibold text-gray-900 dark:text-kick-text mb-1">
                                When do I receive my rewards?
                            </h3>
                            <p className="text-small text-gray-600 dark:text-kick-text-secondary">
                                Rewards are automatically credited to your account when your referral reaches each milestone.
                            </p>
                        </div>
                        <div>
                            <h3 className="text-body font-semibold text-gray-900 dark:text-kick-text mb-1">
                                Can my referral use someone else&apos;s code later?
                            </h3>
                            <p className="text-small text-gray-600 dark:text-kick-text-secondary">
                                No, once someone signs up with a referral code, they&apos;re permanently linked to that referrer.
                            </p>
                        </div>
                        <div>
                            <h3 className="text-body font-semibold text-gray-900 dark:text-kick-text mb-1">
                                Do rewards stack for each milestone?
                            </h3>
                            <p className="text-small text-gray-600 dark:text-kick-text-secondary">
                                Yes! You earn rewards at each tier, so a referral reaching 5,000 Sweet Coins earns you all 5 milestone rewards.
                            </p>
                        </div>
                    </div>
                </div>

                {/* CTA Section */}
                <div className="bg-gradient-to-r from-kick-purple/10 to-kick-purple/5 dark:from-kick-purple/20 dark:to-kick-purple/10 rounded-xl border border-kick-purple/20 p-6 text-center">
                    <h3 className="text-h4 font-semibold text-gray-900 dark:text-kick-text mb-2">
                        🚀 Referral Program is Live!
                    </h3>
                    <p className="text-body text-gray-600 dark:text-kick-text-secondary mb-4">
                        Start sharing your code and earning rewards as your friends earn Sweet Coins!
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
