'use client'

import { Toast } from '@/components/Toast'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { authenticatedFetchJson, getKickUserIdFromCookie } from '@/lib/api-client'

interface Raffle {
    id: string
    title: string
    type: string
    status: string
    start_at: string
    end_at: string
    total_entries: number
    total_tickets_sold?: number
    prize_description: string
    drawn_at?: string
    hidden?: boolean
    number_of_winners?: number
}

export default function AdminRafflesPage() {
    const router = useRouter()
    const [userData, setUserData] = useState<any>(null)
    const [raffles, setRaffles] = useState<Raffle[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedStatus, setSelectedStatus] = useState<string>('all')
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [editingRaffle, setEditingRaffle] = useState<Raffle | null>(null)
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
    useEffect(() => {
        checkAdmin()
    }, [])

    useEffect(() => {
        if (userData?.is_admin) {
            fetchRaffles()
        }
    }, [selectedStatus, userData])

    const copyText = async (text: string, successMessage: string) => {
        try {
            await navigator.clipboard.writeText(text)
            setToast({ message: successMessage, type: 'success' })
        } catch {
            setToast({ message: 'Failed to copy to clipboard', type: 'error' })
        }
    }

    const checkAdmin = async () => {
        try {
            const kickUserId = getKickUserIdFromCookie()
            const data = await authenticatedFetchJson<{ is_admin: boolean }>('/api/admin/verify', {}, kickUserId || undefined)
            if (!data.is_admin) {
                router.push('/')
                return
            }
            setUserData({ is_admin: true })
        } catch (error) {
            console.error('Error checking admin:', error)
            router.push('/')
        } finally {
            setLoading(false)
        }
    }

    const fetchRaffles = async () => {
        try {
            setLoading(true)
            const kickUserId = getKickUserIdFromCookie()
            // Include hidden raffles for admin view
            const statusParam = selectedStatus === 'all' ? '?include_hidden=true' : `?status=${selectedStatus}&include_hidden=true`
            const data = await authenticatedFetchJson<{ raffles: Raffle[] }>(`/api/raffles${statusParam}`, {}, kickUserId || undefined)
            setRaffles(data.raffles || [])
        } catch (error) {
            console.error('Error fetching raffles:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleEndRaffle = async (id: string) => {
        if (!confirm('End raffle early?\n\nThis raffle will close immediately, and no further tickets can be purchased.\n\nYou can draw winners after it ends.')) {
            return
        }

        try {
            const kickUserId = getKickUserIdFromCookie()
            await authenticatedFetchJson(`/api/raffles/${id}/end`, {
                method: 'POST',
            }, kickUserId || undefined)
            setToast({ message: 'Raffle ended early.', type: 'success' })
            await fetchRaffles()
        } catch (error: any) {
            console.error('Error ending raffle:', error)
            setToast({ message: error?.data?.error || error?.message || 'Failed to end raffle', type: 'error' })
        }
    }

    const handleDrawWinners = async (id: string) => {
        if (!confirm('Draw winners?\n\nAre you sure you want to select the winners for this raffle? This action cannot be undone.')) {
            return
        }

        try {
            const kickUserId = getKickUserIdFromCookie()
            const data = await authenticatedFetchJson<{ winners: any[] }>(`/api/raffles/${id}/draw`, {
                method: 'POST',
            }, kickUserId || undefined)
            setToast({ message: '🎉 Winners have been drawn successfully.', type: 'success' })
            await fetchRaffles()
        } catch (error: any) {
            console.error('Error drawing winners:', error)
            setToast({ message: error?.data?.error || error?.message || 'Failed to draw winners. Try again or contact support.', type: 'error' })
        }
    }

    const handleResetDraw = async (raffleId: string) => {
        if (!confirm('Reset draw? All winners will be deleted and raffle will be made active again.')) return
        try {
            const kickUserId = getKickUserIdFromCookie()
            await authenticatedFetchJson(`/api/raffles/${raffleId}/reset`, { method: 'POST' }, kickUserId || undefined)
            setToast({ message: 'Draw has been reset.', type: 'success' })
            await fetchRaffles()
        } catch (err: any) {
            setToast({ message: err?.data?.error || err?.message || 'Failed to reset draw', type: 'error' })
        }
    }

    const handleDelete = async (id: string, hasEntries: boolean) => {
        const message = hasEntries
            ? 'Delete raffle?\n\nWARNING: This raffle has entries. Deleting it will remove all ticket purchases. Consider hiding it instead.\n\nThis action cannot be undone.'
            : 'Delete raffle?\n\nThis raffle has no entries yet. Deleting it will remove it permanently.'

        if (!confirm(message)) {
            return
        }

        try {
            const kickUserId = getKickUserIdFromCookie()
            await authenticatedFetchJson(`/api/raffles/${id}`, {
                method: 'DELETE',
            }, kickUserId || undefined)
            setToast({ message: 'Raffle deleted.', type: 'success' })
            await fetchRaffles()
        } catch (error: any) {
            console.error('Error deleting raffle:', error)
            setToast({ message: error?.data?.error || error?.message || 'Failed to delete raffle', type: 'error' })
        }
    }

    const handleToggleHidden = async (id: string, currentlyHidden: boolean) => {
        try {
            const kickUserId = getKickUserIdFromCookie()
            await authenticatedFetchJson(`/api/raffles/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    hidden: !currentlyHidden,
                }),
            }, kickUserId || undefined)
            setToast({
                message: currentlyHidden ? 'Raffle is now visible to users.' : 'Raffle hidden from public view.',
                type: 'success',
            })
            await fetchRaffles()
        } catch (error: any) {
            console.error('Error toggling raffle visibility:', error)
            setToast({ message: error?.data?.error || error?.message || 'Failed to update raffle', type: 'error' })
        }
    }

    const getStatusBadge = (status: string) => {
        const badges: Record<string, { color: string; label: string }> = {
            upcoming: { color: 'bg-gray-500', label: 'Upcoming' },
            active: { color: 'bg-green-500', label: 'Active' },
            drawing: { color: 'bg-yellow-500', label: 'Drawing' },
            completed: { color: 'bg-blue-500', label: 'Completed' },
            cancelled: { color: 'bg-red-500', label: 'Cancelled' },
        }
        const badge = badges[status] || badges.upcoming
        return (
            <span className={`px-2 py-1 rounded text-xs text-white ${badge.color}`}>
                {badge.label}
            </span>
        )
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
                            Manage Raffles
                        </h1>
                        <p className="text-body text-gray-600 dark:text-kick-text-secondary mt-1">
                            Create and manage all raffles on SweetFlips.
                        </p>
                    </div>
                    <button
                        onClick={() => router.push('/admin/raffles/create')}
                        className="px-6 py-2 bg-kick-purple text-white rounded-lg hover:bg-kick-purple-dark transition-colors"
                    >
                        + Create Raffle
                    </button>
                </div>

                {/* Filters */}
                <div className="flex gap-2">
                    {['all', 'upcoming', 'active', 'completed', 'cancelled'].map((status) => (
                        <button
                            key={status}
                            onClick={() => setSelectedStatus(status)}
                            className={`px-4 py-2 rounded-lg ${
                                selectedStatus === status
                                    ? 'bg-kick-purple text-white'
                                    : 'bg-gray-100 dark:bg-kick-surface text-gray-700 dark:text-kick-text hover:bg-gray-200 dark:hover:bg-kick-surface-hover'
                            }`}
                        >
                            {status.charAt(0).toUpperCase() + status.slice(1)}
                        </button>
                    ))}
                </div>

                {/* Raffles Table */}
                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kick-purple mx-auto"></div>
                    </div>
                ) : raffles.length === 0 ? (
                    <div className="text-center py-12 bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border">
                        <h3 className="text-h4 font-semibold text-gray-900 dark:text-kick-text mb-2">
                            No raffles yet
                        </h3>
                        <p className="text-body text-gray-600 dark:text-kick-text-secondary mb-4">
                            Create your first raffle to get started.
                        </p>
                        <button
                            onClick={() => router.push('/admin/raffles/create')}
                            className="px-6 py-2 bg-kick-purple text-white rounded-lg hover:bg-kick-purple-dark transition-colors"
                        >
                            Create Raffle
                        </button>
                    </div>
                ) : (
                    <div className="overflow-x-auto bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-gray-200 dark:border-kick-border">
                                    <th className="px-6 py-3 text-left text-small font-semibold text-gray-700 dark:text-kick-text-secondary">
                                        Raffle
                                    </th>
                                    <th className="px-6 py-3 text-left text-small font-semibold text-gray-700 dark:text-kick-text-secondary">
                                        Type
                                    </th>
                                    <th className="px-6 py-3 text-left text-small font-semibold text-gray-700 dark:text-kick-text-secondary">
                                        Status
                                    </th>
                                    <th className="px-6 py-3 text-left text-small font-semibold text-gray-700 dark:text-kick-text-secondary">
                                        Start
                                    </th>
                                    <th className="px-6 py-3 text-left text-small font-semibold text-gray-700 dark:text-kick-text-secondary">
                                        End
                                    </th>
                                    <th className="px-6 py-3 text-left text-small font-semibold text-gray-700 dark:text-kick-text-secondary">
                                        Total Entries
                                    </th>
                                    <th className="px-6 py-3 text-left text-small font-semibold text-gray-700 dark:text-kick-text-secondary">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {raffles.map((raffle) => (
                                    <tr
                                        key={raffle.id}
                                        className={`border-b border-gray-200 dark:border-kick-border hover:bg-gray-50 dark:hover:bg-kick-surface-hover ${raffle.hidden ? 'opacity-60' : ''}`}
                                    >
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <span className="text-body text-gray-900 dark:text-kick-text">
                                                    {raffle.title}
                                                </span>
                                                {raffle.hidden && (
                                                    <span className="px-2 py-0.5 text-xs font-medium rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                                                        Hidden
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-body text-gray-900 dark:text-kick-text">
                                            {raffle.type}
                                        </td>
                                        <td className="px-6 py-4">
                                            {getStatusBadge(raffle.status)}
                                        </td>
                                        <td className="px-6 py-4 text-body text-gray-900 dark:text-kick-text">
                                            {new Date(raffle.start_at).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4 text-body text-gray-900 dark:text-kick-text">
                                            {new Date(raffle.end_at).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4 text-body text-gray-900 dark:text-kick-text">
                                            {raffle.total_entries || 0}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-wrap gap-2">
                                                <button
                                                    onClick={() => router.push(`/admin/raffles/edit/${raffle.id}`)}
                                                    className="px-3 py-1 text-xs bg-gray-200 dark:bg-kick-surface-hover text-gray-700 dark:text-kick-text rounded hover:bg-gray-300 dark:hover:bg-kick-dark"
                                                >
                                                    Edit
                                                </button>
                                                {(raffle.status === 'active' || raffle.status === 'upcoming') && (
                                                    <button
                                                        onClick={() => handleEndRaffle(raffle.id)}
                                                        className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                                                    >
                                                        End Now
                                                    </button>
                                                )}
                                                {(raffle.status === 'active' || raffle.status === 'completed') && !raffle.drawn_at && (
                                                    <button
                                                        onClick={() => handleDrawWinners(raffle.id)}
                                                        className="px-3 py-1 text-xs bg-yellow-600 text-white rounded hover:bg-yellow-700"
                                                    >
                                                        Draw Winners
                                                    </button>
                                                )}
                                                {raffle.status === 'completed' && raffle.drawn_at && (
                                                        <button onClick={() => handleResetDraw(raffle.id)} className="px-3 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700">Reset Draw</button>
                                                    )}
                                                {(raffle.status === 'completed' || raffle.status === 'cancelled') && (
                                                    <button
                                                        onClick={() => handleToggleHidden(raffle.id, raffle.hidden || false)}
                                                        className={`px-3 py-1 text-xs rounded ${
                                                            raffle.hidden
                                                                ? 'bg-green-600 text-white hover:bg-green-700'
                                                                : 'bg-gray-500 text-white hover:bg-gray-600'
                                                        }`}
                                                    >
                                                        {raffle.hidden ? 'Unhide' : 'Hide'}
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleDelete(raffle.id, (raffle.total_entries || 0) > 0)}
                                                    className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

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
