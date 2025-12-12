'use client'

import { Toast } from '@/components/Toast'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ADVENT_ITEMS } from '@/lib/advent-calendar'

interface Purchase {
    itemId: string
    tickets: number
    purchasedAt: string
}

interface UserPurchase {
    userId: string
    kickUserId: string
    username: string
    profilePicture: string | null
    totalTickets: number
    totalPointsSpent: number
    purchases: Purchase[]
}

interface Totals {
    totalUsers: number
    totalTickets: number
    totalPointsSpent: number
}

interface RafflePurchase {
    itemId: string
    totalTickets: number
    totalPointsSpent: number
    players: {
        userId: string
        kickUserId: string
        username: string
        profilePicture: string | null
        tickets: number
        pointsSpent: number
        purchasedAt: string
    }[]
}

export default function AdminPurchasesPage() {
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [userData, setUserData] = useState<any>(null)
    const [users, setUsers] = useState<UserPurchase[]>([])
    const [raffles, setRaffles] = useState<RafflePurchase[]>([])
    const [totals, setTotals] = useState<Totals>({ totalUsers: 0, totalTickets: 0, totalPointsSpent: 0 })
    const [availableItems, setAvailableItems] = useState<string[]>([])
    const [search, setSearch] = useState('')
    const [itemFilter, setItemFilter] = useState('')
    const [sortBy, setSortBy] = useState('recent')
    const [expandedUser, setExpandedUser] = useState<string | null>(null)
    const [expandedRaffle, setExpandedRaffle] = useState<string | null>(null)
    const [viewMode, setViewMode] = useState<'users' | 'raffles'>('users')
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

    useEffect(() => {
        checkAdmin()
    }, [])

    useEffect(() => {
        if (userData?.is_admin) {
            fetchPurchases()
        }
    }, [userData, search, itemFilter, sortBy])

    const checkAdmin = async () => {
        try {
            const token = localStorage.getItem('kick_access_token')
            if (!token) {
                router.push('/')
                return
            }

            const response = await fetch('/api/admin/verify', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            })
            if (response.ok) {
                const data = await response.json()
                if (!data.is_admin) {
                    router.push('/')
                    return
                }
                setUserData({ is_admin: true })
            } else {
                router.push('/')
            }
        } catch (error) {
            console.error('Error checking admin:', error)
            router.push('/')
        } finally {
            setLoading(false)
        }
    }

    const fetchPurchases = async () => {
        try {
            setLoading(true)
            const token = localStorage.getItem('kick_access_token')
            if (!token) return

            const params = new URLSearchParams()
            if (search) params.set('search', search)
            if (itemFilter) params.set('item', itemFilter)
            if (sortBy) params.set('sort', sortBy)

            const response = await fetch(`/api/admin/purchases?${params.toString()}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            })

            if (response.ok) {
                const data = await response.json()
                setUsers(data.users || [])
                setRaffles(data.raffles || [])
                setTotals(data.totals || { totalUsers: 0, totalTickets: 0, totalPointsSpent: 0 })
                setAvailableItems(data.items || [])
            } else {
                const error = await response.json()
                setToast({ message: error.error || 'Failed to fetch purchases', type: 'error' })
            }
        } catch (error) {
            console.error('Error fetching purchases:', error)
            setToast({ message: 'Failed to fetch purchases', type: 'error' })
        } finally {
            setLoading(false)
        }
    }

    const formatItemId = (itemId: string) => {
        // Convert "day-9" to "Day 9", "day-23a" to "Day 23 (A)", "day-23b" to "Day 23 (B)"
        const match = itemId.match(/day-(\d+)([a-z])?/)
        if (match) {
            const day = match[1]
            const variant = match[2] ? ` (${match[2].toUpperCase()})` : ''
            return `Day ${day}${variant}`
        }
        return itemId
    }

    const exportToCSV = () => {
        const data = viewMode === 'users'
            ? users.flatMap(user =>
                user.purchases.map(purchase => {
                    const item = ADVENT_ITEMS.find(i => i.id === purchase.itemId)
                    const pointsSpent = item ? item.pointsCost * purchase.tickets : 0
                    return {
                        raffle_day: formatItemId(purchase.itemId),
                        username: user.username,
                        kick_user_id: user.kickUserId,
                        tickets: purchase.tickets,
                        points_spent: pointsSpent,
                        purchased_at: purchase.purchasedAt
                    }
                })
            )
            : raffles.flatMap(raffle =>
                raffle.players.map(player => ({
                    raffle_day: formatItemId(raffle.itemId),
                    username: player.username,
                    kick_user_id: player.kickUserId,
                    tickets: player.tickets,
                    points_spent: player.pointsSpent,
                    purchased_at: player.purchasedAt
                }))
            )

        // Filter by itemFilter if set
        const filteredData = itemFilter
            ? data.filter(row => {
                const match = itemFilter.match(/day-(\d+)([a-z])?/)
                if (match) {
                    const day = match[1]
                    const variant = match[2] || ''
                    return row.raffle_day.includes(`Day ${day}${variant ? ` (${variant.toUpperCase()})` : ''}`)
                }
                return false
            })
            : data

        // Filter by search if set
        const searchFilteredData = search
            ? filteredData.filter(row => row.username.toLowerCase().includes(search.toLowerCase()))
            : filteredData

        // Create CSV content
        const headers = ['raffle_day', 'username', 'kick_user_id', 'tickets', 'points_spent', 'purchased_at']
        const csvContent = [
            headers.join(','),
            ...searchFilteredData.map(row => [
                `"${row.raffle_day}"`,
                `"${row.username.replace(/"/g, '""')}"`,
                row.kick_user_id,
                row.tickets,
                row.points_spent,
                `"${new Date(row.purchased_at).toISOString()}"`
            ].join(','))
        ].join('\n')

        // Download CSV
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        const url = URL.createObjectURL(blob)
        link.setAttribute('href', url)
        link.setAttribute('download', `advent-purchases-${new Date().toISOString().split('T')[0]}.csv`)
        link.style.visibility = 'hidden'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        setToast({ message: 'CSV exported successfully', type: 'success' })
    }


    if (loading || !userData || !userData.is_admin) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kick-purple"></div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-h1 font-semibold text-gray-900 dark:text-kick-text">
                            Ticket Purchases
                        </h1>
                        <p className="text-body text-gray-600 dark:text-kick-text-secondary mt-1">
                            View all advent calendar ticket purchases by users or raffles.
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={exportToCSV}
                            className="px-4 py-2 bg-kick-purple hover:bg-kick-purple-dark text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Export CSV
                        </button>
                    </div>
                </div>

                {/* View Mode Toggle */}
                <div className="flex gap-2">
                    <button
                        onClick={() => setViewMode('users')}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                            viewMode === 'users'
                                ? 'bg-kick-purple text-white'
                                : 'bg-white dark:bg-kick-surface border border-gray-200 dark:border-kick-border text-gray-700 dark:text-kick-text hover:bg-gray-50 dark:hover:bg-kick-surface-hover'
                        }`}
                    >
                        User View
                    </button>
                    <button
                        onClick={() => setViewMode('raffles')}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                            viewMode === 'raffles'
                                ? 'bg-kick-purple text-white'
                                : 'bg-white dark:bg-kick-surface border border-gray-200 dark:border-kick-border text-gray-700 dark:text-kick-text hover:bg-gray-50 dark:hover:bg-kick-surface-hover'
                        }`}
                    >
                        Raffle View
                    </button>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-kick-purple/10 rounded-lg">
                                <svg className="w-6 h-6 text-kick-purple" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-small text-gray-500 dark:text-kick-text-secondary">Total Buyers</p>
                                <p className="text-h2 font-bold text-gray-900 dark:text-kick-text">{totals.totalUsers.toLocaleString()}</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-emerald-500/10 rounded-lg">
                                <svg className="w-6 h-6 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M3 4a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm2 2V5h1v1H5zM3 13a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1H4a1 1 0 01-1-1v-3zm2 2v-1h1v1H5zM13 3a1 1 0 00-1 1v3a1 1 0 001 1h3a1 1 0 001-1V4a1 1 0 00-1-1h-3zm1 2v1h1V5h-1z" clipRule="evenodd" />
                                    <path d="M11 4a1 1 0 10-2 0v1a1 1 0 002 0V4zM10 7a1 1 0 011 1v1h2a1 1 0 110 2h-3a1 1 0 01-1-1V8a1 1 0 011-1zM16 9a1 1 0 100 2 1 1 0 000-2zM9 13a1 1 0 011-1h1a1 1 0 110 2v2a1 1 0 11-2 0v-3zM7 11a1 1 0 100-2H4a1 1 0 100 2h3zM17 13a1 1 0 01-1 1h-2a1 1 0 110-2h2a1 1 0 011 1zM16 17a1 1 0 100-2h-3a1 1 0 100 2h3z" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-small text-gray-500 dark:text-kick-text-secondary">Total Tickets Sold</p>
                                <p className="text-h2 font-bold text-gray-900 dark:text-kick-text">{totals.totalTickets.toLocaleString()}</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-amber-500/10 rounded-lg">
                                <svg className="w-6 h-6 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-small text-gray-500 dark:text-kick-text-secondary">Total Points Spent</p>
                                <p className="text-h2 font-bold text-gray-900 dark:text-kick-text">{totals.totalPointsSpent.toLocaleString()}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1">
                        <input
                            type="text"
                            placeholder="Search by username..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full px-4 py-2 bg-white dark:bg-kick-surface border border-gray-200 dark:border-kick-border rounded-lg text-gray-900 dark:text-kick-text placeholder-gray-500 dark:placeholder-kick-text-secondary focus:outline-none focus:ring-2 focus:ring-kick-purple"
                        />
                    </div>
                    <select
                        value={itemFilter}
                        onChange={(e) => setItemFilter(e.target.value)}
                        className="px-4 py-2 bg-white dark:bg-kick-surface border border-gray-200 dark:border-kick-border rounded-lg text-gray-900 dark:text-kick-text focus:outline-none focus:ring-2 focus:ring-kick-purple"
                    >
                        <option value="">All Items</option>
                        {availableItems.map((item) => (
                            <option key={item} value={item}>{formatItemId(item)}</option>
                        ))}
                    </select>
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="px-4 py-2 bg-white dark:bg-kick-surface border border-gray-200 dark:border-kick-border rounded-lg text-gray-900 dark:text-kick-text focus:outline-none focus:ring-2 focus:ring-kick-purple"
                    >
                        <option value="recent">Most Recent</option>
                        <option value="tickets">Most Tickets</option>
                        <option value="points">Most Points Spent</option>
                        <option value="username">Username A-Z</option>
                    </select>
                </div>

                {/* Users Table */}
                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kick-purple mx-auto"></div>
                    </div>
                ) : viewMode === 'users' ? (
                    users.length === 0 ? (
                        <div className="text-center py-12 bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border">
                            <h3 className="text-h4 font-semibold text-gray-900 dark:text-kick-text mb-2">
                                No purchases yet
                            </h3>
                            <p className="text-body text-gray-600 dark:text-kick-text-secondary">
                                {search || itemFilter ? 'No purchases match your filters.' : 'No one has purchased tickets yet.'}
                            </p>
                        </div>
                    ) : (
                        <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border overflow-hidden">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-gray-200 dark:border-kick-border bg-gray-50 dark:bg-kick-surface-hover">
                                        <th className="px-6 py-3 text-left text-small font-semibold text-gray-700 dark:text-kick-text-secondary">
                                            User
                                        </th>
                                        <th className="px-6 py-3 text-left text-small font-semibold text-gray-700 dark:text-kick-text-secondary">
                                            Total Tickets
                                        </th>
                                        <th className="px-6 py-3 text-left text-small font-semibold text-gray-700 dark:text-kick-text-secondary">
                                            Points Spent
                                        </th>
                                        <th className="px-6 py-3 text-left text-small font-semibold text-gray-700 dark:text-kick-text-secondary">
                                            Items
                                        </th>
                                        <th className="px-6 py-3 text-left text-small font-semibold text-gray-700 dark:text-kick-text-secondary">
                                            Details
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map((user) => (
                                        <>
                                            <tr
                                                key={user.userId}
                                                className="border-b border-gray-200 dark:border-kick-border hover:bg-gray-50 dark:hover:bg-kick-surface-hover cursor-pointer"
                                                onClick={() => setExpandedUser(expandedUser === user.userId ? null : user.userId)}
                                            >
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        {user.profilePicture ? (
                                                            <img
                                                                src={user.profilePicture}
                                                                alt={user.username}
                                                                className="w-8 h-8 rounded-full"
                                                            />
                                                        ) : (
                                                            <div className="w-8 h-8 rounded-full bg-kick-purple/20 flex items-center justify-center">
                                                                <span className="text-kick-purple font-bold text-sm">
                                                                    {user.username[0].toUpperCase()}
                                                                </span>
                                                            </div>
                                                        )}
                                                        <span className="text-body font-medium text-gray-900 dark:text-kick-text">
                                                            {user.username}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="text-body text-gray-900 dark:text-kick-text font-semibold">
                                                        {user.totalTickets.toLocaleString()}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="text-body text-amber-600 dark:text-amber-400 font-semibold">
                                                        {user.totalPointsSpent.toLocaleString()}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="text-small text-gray-600 dark:text-kick-text-secondary">
                                                        {user.purchases.length} item{user.purchases.length !== 1 ? 's' : ''}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <button className="text-kick-purple hover:text-kick-purple-dark">
                                                        <svg
                                                            className={`w-5 h-5 transition-transform ${expandedUser === user.userId ? 'rotate-180' : ''}`}
                                                            fill="none"
                                                            stroke="currentColor"
                                                            viewBox="0 0 24 24"
                                                        >
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                        </svg>
                                                    </button>
                                                </td>
                                            </tr>
                                            {expandedUser === user.userId && (
                                                <tr className="bg-gray-50 dark:bg-kick-dark">
                                                    <td colSpan={5} className="px-6 py-4">
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                                            {user.purchases.map((purchase, idx) => (
                                                                <div
                                                                    key={`${purchase.itemId}-${idx}`}
                                                                    className="bg-white dark:bg-kick-surface rounded-lg p-3 border border-gray-200 dark:border-kick-border"
                                                                >
                                                                    <div className="flex items-center justify-between">
                                                                        <span className="font-medium text-gray-900 dark:text-kick-text">
                                                                            {formatItemId(purchase.itemId)}
                                                                        </span>
                                                                        <span className="text-kick-purple font-bold">
                                                                            ×{purchase.tickets}
                                                                        </span>
                                                                    </div>
                                                                    <p className="text-xs text-gray-500 dark:text-kick-text-secondary mt-1">
                                                                        {new Date(purchase.purchasedAt).toLocaleString()}
                                                                    </p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )
                ) : (
                    // Raffle View
                    raffles.length === 0 ? (
                        <div className="text-center py-12 bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border">
                            <h3 className="text-h4 font-semibold text-gray-900 dark:text-kick-text mb-2">
                                No purchases yet
                            </h3>
                            <p className="text-body text-gray-600 dark:text-kick-text-secondary">
                                No raffles have purchases yet.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {raffles
                                .filter(raffle => !itemFilter || raffle.itemId === itemFilter)
                                .map((raffle) => (
                                    <div
                                        key={raffle.itemId}
                                        className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border overflow-hidden"
                                    >
                                        <div
                                            className="p-6 cursor-pointer hover:bg-gray-50 dark:hover:bg-kick-surface-hover transition-colors"
                                            onClick={() => setExpandedRaffle(expandedRaffle === raffle.itemId ? null : raffle.itemId)}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div>
                                                        <h3 className="text-h3 font-semibold text-gray-900 dark:text-kick-text">
                                                            {formatItemId(raffle.itemId)}
                                                        </h3>
                                                        <p className="text-small text-gray-600 dark:text-kick-text-secondary mt-1">
                                                            {raffle.players.length} player{raffle.players.length !== 1 ? 's' : ''}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-6">
                                                    <div className="text-right">
                                                        <p className="text-small text-gray-500 dark:text-kick-text-secondary">Total Tickets</p>
                                                        <p className="text-h3 font-bold text-gray-900 dark:text-kick-text">
                                                            {raffle.totalTickets.toLocaleString()}
                                                        </p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-small text-gray-500 dark:text-kick-text-secondary">Points Spent</p>
                                                        <p className="text-h3 font-bold text-amber-600 dark:text-amber-400">
                                                            {raffle.totalPointsSpent.toLocaleString()}
                                                        </p>
                                                    </div>
                                                    <button className="text-kick-purple hover:text-kick-purple-dark">
                                                        <svg
                                                            className={`w-5 h-5 transition-transform ${expandedRaffle === raffle.itemId ? 'rotate-180' : ''}`}
                                                            fill="none"
                                                            stroke="currentColor"
                                                            viewBox="0 0 24 24"
                                                        >
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                        {expandedRaffle === raffle.itemId && (
                                            <div className="border-t border-gray-200 dark:border-kick-border bg-gray-50 dark:bg-kick-dark p-6">
                                                <div className="space-y-3">
                                                    {raffle.players
                                                        .filter(player => !search || player.username.toLowerCase().includes(search.toLowerCase()))
                                                        .map((player) => (
                                                            <div
                                                                key={`${raffle.itemId}-${player.userId}`}
                                                                className="bg-white dark:bg-kick-surface rounded-lg p-4 border border-gray-200 dark:border-kick-border flex items-center justify-between"
                                                            >
                                                                <div className="flex items-center gap-3">
                                                                    {player.profilePicture ? (
                                                                        <img
                                                                            src={player.profilePicture}
                                                                            alt={player.username}
                                                                            className="w-10 h-10 rounded-full"
                                                                        />
                                                                    ) : (
                                                                        <div className="w-10 h-10 rounded-full bg-kick-purple/20 flex items-center justify-center">
                                                                            <span className="text-kick-purple font-bold">
                                                                                {player.username[0].toUpperCase()}
                                                                            </span>
                                                                        </div>
                                                                    )}
                                                                    <div>
                                                                        <p className="text-body font-medium text-gray-900 dark:text-kick-text">
                                                                            {player.username}
                                                                        </p>
                                                                        <p className="text-xs text-gray-500 dark:text-kick-text-secondary">
                                                                            {new Date(player.purchasedAt).toLocaleString()}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-6">
                                                                    <div className="text-right">
                                                                        <p className="text-xs text-gray-500 dark:text-kick-text-secondary">Tickets</p>
                                                                        <p className="text-body font-bold text-kick-purple">
                                                                            {player.tickets}
                                                                        </p>
                                                                    </div>
                                                                    <div className="text-right">
                                                                        <p className="text-xs text-gray-500 dark:text-kick-text-secondary">Points</p>
                                                                        <p className="text-body font-bold text-amber-600 dark:text-amber-400">
                                                                            {player.pointsSpent}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                        </div>
                    )
                )}
            </div>

            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast(null)}
                />
            )}
        </div>
    )
}
