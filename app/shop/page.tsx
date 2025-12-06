'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/AppLayout'

interface ShopItem {
    id: string
    name: string
    description: string
    pointsCost: number
    ticketsAwarded: number
    icon: string
    popular?: boolean
    bestValue?: boolean
}

const SHOP_ITEMS: ShopItem[] = [
    {
        id: 'tickets-1',
        name: 'Starter Pack',
        description: '1 Raffle Ticket',
        pointsCost: 100,
        ticketsAwarded: 1,
        icon: '🎟️',
    },
    {
        id: 'tickets-5',
        name: 'Regular Pack',
        description: '5 Raffle Tickets',
        pointsCost: 450,
        ticketsAwarded: 5,
        icon: '🎫',
        popular: true,
    },
    {
        id: 'tickets-10',
        name: 'Value Pack',
        description: '10 Raffle Tickets',
        pointsCost: 800,
        ticketsAwarded: 10,
        icon: '🎪',
    },
    {
        id: 'tickets-25',
        name: 'Premium Pack',
        description: '25 Raffle Tickets',
        pointsCost: 1800,
        ticketsAwarded: 25,
        icon: '🏆',
        bestValue: true,
    },
]

export default function ShopPage() {
    const router = useRouter()
    const [userBalance, setUserBalance] = useState(0)
    const [isConnected, setIsConnected] = useState(false)
    const [loading, setLoading] = useState(true)

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
                        Connect your Kick account to access the shop
                    </h2>
                    <p className="text-body text-gray-600 dark:text-kick-text-secondary mb-6">
                        The shop is available for verified Kick viewers. Connect your account to exchange points for raffle tickets.
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
                <div className="relative overflow-hidden bg-gradient-to-r from-kick-purple via-purple-600 to-indigo-600 rounded-2xl p-8 text-white">
                    <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%23ffffff%22%20fill-opacity%3D%220.08%22%3E%3Cpath%20d%3D%22M36%2034v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6%2034v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6%204V0H4v4H0v2h4v4h2V6h4V4H6z%22%2F%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E')] opacity-50"></div>
                    <div className="relative z-10 text-center">
                        <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-4 py-2 mb-4">
                            <span className="relative flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-400"></span>
                            </span>
                            <span className="text-sm font-medium">Coming Soon</span>
                        </div>
                        <h1 className="text-4xl md:text-5xl font-bold mb-4">
                            Points Shop
                        </h1>
                        <p className="text-lg text-white/90 max-w-2xl mx-auto">
                            Exchange your hard-earned points for raffle tickets and increase your chances of winning amazing prizes!
                        </p>
                    </div>
                    {/* Decorative elements */}
                    <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
                    <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
                </div>

                {/* Points Balance Card */}
                <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-kick-purple/20 flex items-center justify-center">
                                <svg className="w-6 h-6 text-kick-purple" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M9.049 2.927c.765-1.36 2.722-1.36 3.486 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-small font-medium text-gray-600 dark:text-kick-text-secondary">
                                    Your Points Balance
                                </p>
                                <p className="text-h2 font-bold text-kick-purple">
                                    {userBalance.toLocaleString()}
                                </p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-small text-gray-500 dark:text-kick-text-muted">
                                Earn points by chatting during streams
                            </p>
                        </div>
                    </div>
                </div>

                {/* Shop Items Preview */}
                <div>
                    <h2 className="text-h3 font-semibold text-gray-900 dark:text-kick-text mb-4">
                        Ticket Packs
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {SHOP_ITEMS.map((item) => (
                            <div
                                key={item.id}
                                className="relative bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6 opacity-75 cursor-not-allowed"
                            >
                                {/* Badge */}
                                {item.popular && (
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                                        <span className="bg-kick-purple text-white text-xs font-semibold px-3 py-1 rounded-full">
                                            Popular
                                        </span>
                                    </div>
                                )}
                                {item.bestValue && (
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                                        <span className="bg-kick-green text-white text-xs font-semibold px-3 py-1 rounded-full">
                                            Best Value
                                        </span>
                                    </div>
                                )}

                                <div className="text-center">
                                    <div className="text-4xl mb-3">{item.icon}</div>
                                    <h3 className="text-h4 font-semibold text-gray-900 dark:text-kick-text mb-1">
                                        {item.name}
                                    </h3>
                                    <p className="text-small text-gray-600 dark:text-kick-text-secondary mb-4">
                                        {item.description}
                                    </p>
                                    <div className="flex items-center justify-center gap-1 mb-4">
                                        <svg className="w-5 h-5 text-kick-purple" fill="currentColor" viewBox="0 0 20 20">
                                            <path d="M9.049 2.927c.765-1.36 2.722-1.36 3.486 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                        </svg>
                                        <span className="text-h4 font-bold text-kick-purple">
                                            {item.pointsCost.toLocaleString()}
                                        </span>
                                    </div>
                                    <button
                                        disabled
                                        className="w-full py-2 px-4 bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-lg font-medium cursor-not-allowed"
                                    >
                                        Coming Soon
                                    </button>
                                </div>

                                {/* Savings badge for value packs */}
                                {item.ticketsAwarded > 1 && (
                                    <div className="mt-3 text-center">
                                        <span className="text-xs text-kick-green font-medium">
                                            Save {Math.round((1 - (item.pointsCost / (item.ticketsAwarded * 100))) * 100)}% vs individual
                                        </span>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* How It Works */}
                <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6">
                    <h2 className="text-h3 font-semibold text-gray-900 dark:text-kick-text mb-6">
                        How It Works
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="text-center">
                            <div className="w-16 h-16 rounded-full bg-kick-purple/20 flex items-center justify-center mx-auto mb-4">
                                <span className="text-2xl">💬</span>
                            </div>
                            <h3 className="text-h4 font-semibold text-gray-900 dark:text-kick-text mb-2">
                                1. Earn Points
                            </h3>
                            <p className="text-small text-gray-600 dark:text-kick-text-secondary">
                                Chat during SweetFlips streams to earn points automatically. Subscribers earn 2x!
                            </p>
                        </div>
                        <div className="text-center">
                            <div className="w-16 h-16 rounded-full bg-kick-purple/20 flex items-center justify-center mx-auto mb-4">
                                <span className="text-2xl">🛒</span>
                            </div>
                            <h3 className="text-h4 font-semibold text-gray-900 dark:text-kick-text mb-2">
                                2. Buy Tickets
                            </h3>
                            <p className="text-small text-gray-600 dark:text-kick-text-secondary">
                                Exchange your points for raffle tickets. Bigger packs = better value!
                            </p>
                        </div>
                        <div className="text-center">
                            <div className="w-16 h-16 rounded-full bg-kick-purple/20 flex items-center justify-center mx-auto mb-4">
                                <span className="text-2xl">🎉</span>
                            </div>
                            <h3 className="text-h4 font-semibold text-gray-900 dark:text-kick-text mb-2">
                                3. Win Prizes
                            </h3>
                            <p className="text-small text-gray-600 dark:text-kick-text-secondary">
                                Use tickets to enter raffles and win amazing prizes from the stream!
                            </p>
                        </div>
                    </div>
                </div>

                {/* Notify Me Section */}
                <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-kick-surface dark:to-kick-dark rounded-xl border border-gray-200 dark:border-kick-border p-6 text-center">
                    <h3 className="text-h4 font-semibold text-gray-900 dark:text-kick-text mb-2">
                        Want to be notified when the shop opens?
                    </h3>
                    <p className="text-body text-gray-600 dark:text-kick-text-secondary mb-4">
                        Keep watching the streams and stay tuned for updates!
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
                        Follow on Kick
                    </a>
                </div>
            </div>
        </AppLayout>
    )
}
