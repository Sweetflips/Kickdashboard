'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import RaffleCard from '@/components/RaffleCard'
import PointsBar from '@/components/PointsBar'
import WinnerClaimModal from '@/components/WinnerClaimModal'
import { Toast } from '@/components/Toast'

interface Raffle {
    id: string
    title: string
    type: string
    prize_description: string
    ticket_cost: number
    max_tickets_per_user?: number | null
    total_tickets_cap?: number | null
    total_tickets_sold: number
    user_tickets: number
    start_at: string
    end_at: string
    status: string
    sub_only: boolean
    hidden_until_start: boolean
    description?: string
}

interface MyTicket {
    id: string
    raffle_id: string
    tickets: number
    created_at: string
    raffle: {
        id: string
        title: string
        type: string
        prize_description: string
        status: string
        end_at: string
        drawn_at?: string | null
        claim_message?: string | null
        total_tickets_sold: number
        total_entries: number
        is_winner: boolean
    }
}

interface HistoryRaffle {
    id: string
    title: string
    type: string
    prize_description: string
    end_at: string
    total_tickets_sold: number
    total_entries: number
    winners: Array<{
        username: string
        kick_user_id: string
        tickets: number
    }>
    draw_seed?: string
    drawn_at?: string | null
}

export default function RafflesPage() {
    const router = useRouter()
    const [activeTab, setActiveTab] = useState<'active' | 'my-tickets' | 'history'>('active')
    const [userBalance, setUserBalance] = useState(0)
    const [isSubscriber, setIsSubscriber] = useState(false)
    const [isConnected, setIsConnected] = useState(false)
    const [loading, setLoading] = useState(true)
    const [raffles, setRaffles] = useState<Raffle[]>([])
    const [myTickets, setMyTickets] = useState<MyTicket[]>([])
    const [history, setHistory] = useState<HistoryRaffle[]>([])
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
    const [historyFilter, setHistoryFilter] = useState<'all' | 'entered'>('all')
    const [selectedWinningRaffle, setSelectedWinningRaffle] = useState<{
        title: string
        prize_description: string
        claim_message?: string | null
        drawn_at?: string | null
    } | null>(null)

    useEffect(() => {
        checkAuth()
    }, [])

    useEffect(() => {
        if (isConnected) {
            fetchUserBalance()
            fetchData()
        }
    }, [isConnected, activeTab, historyFilter])

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
                        setIsSubscriber(pointsData.is_subscriber || false)
                    } else {
                        console.error('Failed to fetch points:', await pointsResponse.text())
                    }
                }
            }
        } catch (error) {
            console.error('Error fetching user balance:', error)
        }
    }

    const fetchData = async () => {
        try {
            const token = localStorage.getItem('kick_access_token')
            if (!token) return

            if (activeTab === 'active') {
                const response = await fetch('/api/raffles', {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                })
                if (response.ok) {
                    const data = await response.json()
                    setRaffles(data.raffles || [])
                }
            } else if (activeTab === 'my-tickets') {
                const response = await fetch('/api/raffles/my-tickets', {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                })
                if (response.ok) {
                    const data = await response.json()
                    setMyTickets(data.entries || [])
                }
            } else if (activeTab === 'history') {
                const response = await fetch(`/api/raffles/history?filter=${historyFilter}`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                })
                if (response.ok) {
                    const data = await response.json()
                    setHistory(data.raffles || [])
                }
            }
        } catch (error) {
            console.error('Error fetching data:', error)
        }
    }

    const handlePurchase = async (raffleId: string, quantity: number) => {
        try {
            const token = localStorage.getItem('kick_access_token')
            if (!token) return

            const response = await fetch(`/api/raffles/${raffleId}/buy`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ quantity }),
            })

            if (response.ok) {
                const data = await response.json()
                setUserBalance(data.new_balance || 0)
                setToast({
                    message: `🎟 Bought ${quantity} tickets for ${raffles.find(r => r.id === raffleId)?.title || 'raffle'}. Good luck!`,
                    type: 'success',
                })
                await fetchData()
                await fetchUserBalance()
            } else {
                const error = await response.json()
                setToast({
                    message: error.error || 'Failed to purchase tickets',
                    type: 'error',
                })
                throw new Error(error.error || 'Failed to purchase tickets')
            }
        } catch (error) {
            setToast({
                message: 'Something went wrong while processing your purchase. Please try again.',
                type: 'error',
            })
            throw error
        }
    }

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
                    Connect your Kick account to join raffles
                </h2>
                <p className="text-body text-gray-600 dark:text-kick-text-secondary mb-6">
                    Raffles are reserved for verified Kick viewers. Connect your account to see available raffles and use your points.
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
        <>
            <div className="space-y-6">
                {/* Header */}
                <div>
                    <h1 className="text-h1 font-semibold text-gray-900 dark:text-kick-text mb-2">
                        Raffles
                    </h1>
                    <p className="text-body text-gray-600 dark:text-kick-text-secondary">
                        Use your points to enter raffles and win rewards.
                    </p>
                </div>

                <PointsBar points={userBalance} />

                {/* Tabs */}
                <div className="border-b border-gray-200 dark:border-kick-border">
                    <nav className="flex gap-4">
                        {(['active', 'my-tickets', 'history'] as const).map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-4 py-2 text-body font-medium border-b-2 transition-colors ${
                                    activeTab === tab
                                        ? 'border-kick-purple text-kick-purple'
                                        : 'border-transparent text-gray-600 dark:text-kick-text-secondary hover:text-gray-900 dark:hover:text-kick-text'
                                }`}
                            >
                                {tab === 'active' ? 'Active' : tab === 'my-tickets' ? 'My tickets' : 'Raffle history'}
                            </button>
                        ))}
                    </nav>
                </div>

                {/* Content */}
                {activeTab === 'active' && (
                    <div>
                        <h2 className="text-h3 font-semibold text-gray-900 dark:text-kick-text mb-4">
                            Active raffles
                        </h2>
                        {raffles.length === 0 ? (
                            <div className="text-center py-12 bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border">
                                <h3 className="text-h4 font-semibold text-gray-900 dark:text-kick-text mb-2">
                                    No active raffles right now
                                </h3>
                                <p className="text-body text-gray-600 dark:text-kick-text-secondary">
                                    Check back later or follow SweetFlips on Kick to be notified when new raffles go live.
                                </p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {raffles.map((raffle) => (
                                    <RaffleCard
                                        key={raffle.id}
                                        raffle={raffle}
                                        userBalance={userBalance}
                                        isSubscriber={isSubscriber}
                                        onPurchase={handlePurchase}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'my-tickets' && (
                    <div>
                        <h2 className="text-h3 font-semibold text-gray-900 dark:text-kick-text mb-4">
                            Your raffle tickets
                        </h2>
                        {myTickets.length === 0 ? (
                            <div className="text-center py-12 bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border">
                                <h3 className="text-h4 font-semibold text-gray-900 dark:text-kick-text mb-2">
                                    You have not joined any raffles yet
                                </h3>
                                <p className="text-body text-gray-600 dark:text-kick-text-secondary">
                                    Buy tickets from the Active tab to participate in raffles and appear here.
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border">
                                    <thead>
                                        <tr className="border-b border-gray-200 dark:border-kick-border">
                                            <th className="px-6 py-3 text-left text-small font-semibold text-gray-700 dark:text-kick-text-secondary">
                                                Raffle
                                            </th>
                                            <th className="px-6 py-3 text-left text-small font-semibold text-gray-700 dark:text-kick-text-secondary">
                                                Status
                                            </th>
                                            <th className="px-6 py-3 text-left text-small font-semibold text-gray-700 dark:text-kick-text-secondary">
                                                Tickets owned
                                            </th>
                                            <th className="px-6 py-3 text-left text-small font-semibold text-gray-700 dark:text-kick-text-secondary">
                                                Prize
                                            </th>
                                            <th className="px-6 py-3 text-left text-small font-semibold text-gray-700 dark:text-kick-text-secondary">
                                                Result
                                            </th>
                                            <th className="px-6 py-3 text-left text-small font-semibold text-gray-700 dark:text-kick-text-secondary">
                                                Ended on
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {myTickets.map((ticket) => (
                                            <tr
                                                key={ticket.id}
                                                className="border-b border-gray-200 dark:border-kick-border hover:bg-gray-50 dark:hover:bg-kick-surface-hover"
                                            >
                                                <td className="px-6 py-4 text-body text-gray-900 dark:text-kick-text">
                                                    {ticket.raffle.title}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span
                                                        className={`px-2 py-1 text-xs font-medium rounded ${
                                                            ticket.raffle.status === 'active'
                                                                ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                                                                : 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
                                                        }`}
                                                    >
                                                        {ticket.raffle.status === 'active' ? 'Active' : 'Completed'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-body text-gray-900 dark:text-kick-text">
                                                    {ticket.tickets}
                                                </td>
                                                <td className="px-6 py-4 text-body text-gray-900 dark:text-kick-text">
                                                    {ticket.raffle.prize_description}
                                                </td>
                                                <td className="px-6 py-4">
                                                    {ticket.raffle.status === 'active' ? (
                                                        <span className="text-body text-gray-600 dark:text-kick-text-secondary">
                                                            Pending
                                                        </span>
                                                    ) : ticket.raffle.is_winner ? (
                                                        <button
                                                            onClick={() => setSelectedWinningRaffle({
                                                                title: ticket.raffle.title,
                                                                prize_description: ticket.raffle.prize_description,
                                                                claim_message: ticket.raffle.claim_message,
                                                                drawn_at: ticket.raffle.drawn_at,
                                                            })}
                                                            className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer"
                                                        >
                                                            <span className="text-body text-green-600 dark:text-green-400 font-medium">
                                                                Won
                                                            </span>
                                                            <span className="px-2 py-1 text-xs font-medium rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
                                                                Click to Claim
                                                            </span>
                                                        </button>
                                                    ) : (
                                                        <span className="text-body text-gray-600 dark:text-kick-text-secondary">
                                                            Not selected
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-body text-gray-900 dark:text-kick-text">
                                                    {new Date(ticket.raffle.end_at).toLocaleDateString()}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'history' && (
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-h3 font-semibold text-gray-900 dark:text-kick-text">
                                Past raffles
                            </h2>
                            <div className="flex items-center gap-2">
                                <label className="text-small text-gray-600 dark:text-kick-text-secondary">
                                    Show:
                                </label>
                                <select
                                    value={historyFilter}
                                    onChange={(e) => setHistoryFilter(e.target.value as 'all' | 'entered')}
                                    className="px-3 py-1 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text"
                                >
                                    <option value="all">All raffles</option>
                                    <option value="entered">Only raffles I entered</option>
                                </select>
                            </div>
                        </div>
                        {history.length === 0 ? (
                            <div className="text-center py-12 bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border">
                                <h3 className="text-h4 font-semibold text-gray-900 dark:text-kick-text mb-2">
                                    No raffles have been completed yet
                                </h3>
                                <p className="text-body text-gray-600 dark:text-kick-text-secondary">
                                    Once raffles end, you will be able to see all past raffles and winners here.
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border">
                                    <thead>
                                        <tr className="border-b border-gray-200 dark:border-kick-border">
                                            <th className="px-6 py-3 text-left text-small font-semibold text-gray-700 dark:text-kick-text-secondary">
                                                Raffle
                                            </th>
                                            <th className="px-6 py-3 text-left text-small font-semibold text-gray-700 dark:text-kick-text-secondary">
                                                End date
                                            </th>
                                            <th className="px-6 py-3 text-left text-small font-semibold text-gray-700 dark:text-kick-text-secondary">
                                                Prize
                                            </th>
                                            <th className="px-6 py-3 text-left text-small font-semibold text-gray-700 dark:text-kick-text-secondary">
                                                Total entries
                                            </th>
                                            <th className="px-6 py-3 text-left text-small font-semibold text-gray-700 dark:text-kick-text-secondary">
                                                Winners
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {history.map((raffle) => (
                                            <tr
                                                key={raffle.id}
                                                className="border-b border-gray-200 dark:border-kick-border hover:bg-gray-50 dark:hover:bg-kick-surface-hover"
                                            >
                                                <td className="px-6 py-4 text-body text-gray-900 dark:text-kick-text">
                                                    {raffle.title}
                                                </td>
                                                <td className="px-6 py-4 text-body text-gray-900 dark:text-kick-text">
                                                    {new Date(raffle.end_at).toLocaleDateString()}
                                                </td>
                                                <td className="px-6 py-4 text-body text-gray-900 dark:text-kick-text">
                                                    {raffle.prize_description}
                                                </td>
                                                <td className="px-6 py-4 text-body text-gray-900 dark:text-kick-text">
                                                    {raffle.total_entries.toLocaleString()}
                                                </td>
                                                <td className="px-6 py-4 text-body text-gray-900 dark:text-kick-text">
                                                    {raffle.winners.length > 0
                                                        ? raffle.winners
                                                              .slice(0, 3)
                                                              .map((w) => w.username)
                                                              .join(', ') + (raffle.winners.length > 3 ? '...' : '')
                                                        : 'No winners'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <WinnerClaimModal
                isOpen={selectedWinningRaffle !== null}
                onClose={() => setSelectedWinningRaffle(null)}
                raffle={selectedWinningRaffle}
            />

            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast(null)}
                />
            )}
        </>
    )
}
