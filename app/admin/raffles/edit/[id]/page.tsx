'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import AppLayout from '@/components/AppLayout'
import { Toast } from '@/components/Toast'

export default function EditRafflePage() {
    const router = useRouter()
    const params = useParams()
    const raffleId = params.id as string

    const [loading, setLoading] = useState(true)
    const [isAdmin, setIsAdmin] = useState(false)
    const [saving, setSaving] = useState(false)
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
    const [hasEntries, setHasEntries] = useState(false)

    const [formData, setFormData] = useState({
        title: '',
        description: '',
        type: 'general',
        prize_description: '',
        claim_message: '',
        ticket_cost: '',
        max_tickets_per_user: '',
        total_tickets_cap: '',
        start_at: '',
        end_at: '',
        sub_only: false,
        hidden_until_start: false,
    })

    useEffect(() => {
        checkAdmin()
    }, [])

    useEffect(() => {
        if (isAdmin && raffleId) {
            fetchRaffle()
        }
    }, [isAdmin, raffleId])

    const checkAdmin = async () => {
        try {
            const token = localStorage.getItem('kick_access_token')
            if (!token) {
                router.push('/')
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
                if (!data.is_admin) {
                    router.push('/')
                    return
                }
                setIsAdmin(true)
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

    const fetchRaffle = async () => {
        try {
            const token = localStorage.getItem('kick_access_token')
            if (!token) return

            const response = await fetch(`/api/raffles/${raffleId}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            })

            if (response.ok) {
                const data = await response.json()
                const raffle = data.raffle

                // Check if raffle has entries
                setHasEntries((raffle.total_entries || 0) > 0)

                setFormData({
                    title: raffle.title || '',
                    description: raffle.description || '',
                    type: raffle.type || 'general',
                    prize_description: raffle.prize_description || '',
                    claim_message: raffle.claim_message || '',
                    ticket_cost: raffle.ticket_cost?.toString() || '',
                    max_tickets_per_user: raffle.max_tickets_per_user?.toString() || '',
                    total_tickets_cap: raffle.total_tickets_cap?.toString() || '',
                    start_at: raffle.start_at ? new Date(raffle.start_at).toISOString().slice(0, 16) : '',
                    end_at: raffle.end_at ? new Date(raffle.end_at).toISOString().slice(0, 16) : '',
                    sub_only: raffle.sub_only || false,
                    hidden_until_start: raffle.hidden_until_start || false,
                })
            }
        } catch (error) {
            console.error('Error fetching raffle:', error)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        setToast(null)

        try {
            const token = localStorage.getItem('kick_access_token')
            if (!token) return

            const response = await fetch(`/api/raffles/${raffleId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    ...formData,
                    ticket_cost: parseInt(formData.ticket_cost),
                    max_tickets_per_user: formData.max_tickets_per_user ? parseInt(formData.max_tickets_per_user) : null,
                    total_tickets_cap: formData.total_tickets_cap ? parseInt(formData.total_tickets_cap) : null,
                    start_at: new Date(formData.start_at).toISOString(),
                    end_at: new Date(formData.end_at).toISOString(),
                    claim_message: formData.claim_message.trim() || null,
                }),
            })

            if (response.ok) {
                setToast({ message: 'Raffle updated.', type: 'success' })
                setTimeout(() => {
                    router.push('/admin/raffles')
                }, 1000)
            } else {
                const error = await response.json()
                setToast({ message: error.error || 'Could not update raffle.', type: 'error' })
            }
        } catch (error) {
            console.error('Error updating raffle:', error)
            setToast({ message: 'Could not update raffle.', type: 'error' })
        } finally {
            setSaving(false)
        }
    }

    if (loading || !isAdmin) {
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
            <div className="max-w-4xl mx-auto space-y-6">
                <div>
                    <h1 className="text-h1 font-semibold text-gray-900 dark:text-kick-text">
                        Edit Raffle: {formData.title || 'Loading...'}
                    </h1>
                </div>

                {hasEntries && (
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                        <p className="text-small text-yellow-800 dark:text-yellow-200">
                            Tickets have already been purchased for this raffle. Some fields are locked.
                        </p>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Raffle Details */}
                    <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6">
                        <h2 className="text-h3 font-semibold text-gray-900 dark:text-kick-text mb-4">
                            Raffle Details
                        </h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-small font-medium text-gray-700 dark:text-kick-text-secondary mb-2">
                                    Raffle Title {!hasEntries && '*'}
                                </label>
                                <input
                                    type="text"
                                    required={!hasEntries}
                                    disabled={hasEntries}
                                    value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                    placeholder="Weekly $10 Gift Card"
                                    className="w-full px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text disabled:opacity-50 disabled:cursor-not-allowed"
                                />
                            </div>

                            <div>
                                <label className="block text-small font-medium text-gray-700 dark:text-kick-text-secondary mb-2">
                                    Description
                                </label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="This raffle rewards 5 winners with $10 USDT tips."
                                    rows={3}
                                    className="w-full px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text"
                                />
                            </div>

                            <div>
                                <label className="block text-small font-medium text-gray-700 dark:text-kick-text-secondary mb-2">
                                    Raffle Type
                                </label>
                                <select
                                    value={formData.type}
                                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                    disabled={hasEntries}
                                    className="w-full px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <option value="daily">Daily</option>
                                    <option value="weekly">Weekly</option>
                                    <option value="special">Special</option>
                                    <option value="sub_only">Sub only</option>
                                    <option value="general">General</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Prize Information */}
                    <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6">
                        <h2 className="text-h3 font-semibold text-gray-900 dark:text-kick-text mb-4">
                            Prize Information
                        </h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-small font-medium text-gray-700 dark:text-kick-text-secondary mb-2">
                                    Prize Description {!hasEntries && '*'}
                                </label>
                                <input
                                    type="text"
                                    required={!hasEntries}
                                    disabled={hasEntries}
                                    value={formData.prize_description}
                                    onChange={(e) => setFormData({ ...formData, prize_description: e.target.value })}
                                    placeholder="$10 USDT tip (5 winners)"
                                    className="w-full px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text disabled:opacity-50 disabled:cursor-not-allowed"
                                />
                            </div>

                            <div>
                                <label className="block text-small font-medium text-gray-700 dark:text-kick-text-secondary mb-2">
                                    Claim Instructions (optional)
                                </label>
                                <textarea
                                    value={formData.claim_message}
                                    onChange={(e) => setFormData({ ...formData, claim_message: e.target.value })}
                                    placeholder="Contact @danielsweetflips on Telegram to claim your prize."
                                    rows={3}
                                    className="w-full px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text"
                                />
                                <p className="mt-1 text-xs text-gray-500 dark:text-kick-text-muted">
                                    Instructions shown to winners on how to claim their prize. Leave blank to use default message.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Ticket Settings */}
                    <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6">
                        <h2 className="text-h3 font-semibold text-gray-900 dark:text-kick-text mb-4">
                            Ticket Settings
                        </h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-small font-medium text-gray-700 dark:text-kick-text-secondary mb-2">
                                    Cost per ticket {!hasEntries && '*'}
                                </label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        required={!hasEntries}
                                        disabled={hasEntries}
                                        min="1"
                                        value={formData.ticket_cost}
                                        onChange={(e) => setFormData({ ...formData, ticket_cost: e.target.value })}
                                        placeholder="50"
                                        className="flex-1 px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text disabled:opacity-50 disabled:cursor-not-allowed"
                                    />
                                    <span className="text-body text-gray-600 dark:text-kick-text-secondary">points</span>
                                </div>
                            </div>

                            <div>
                                <label className="block text-small font-medium text-gray-700 dark:text-kick-text-secondary mb-2">
                                    Max tickets per user
                                </label>
                                <input
                                    type="number"
                                    disabled={hasEntries}
                                    min="1"
                                    value={formData.max_tickets_per_user}
                                    onChange={(e) => setFormData({ ...formData, max_tickets_per_user: e.target.value })}
                                    placeholder="5"
                                    className="w-full px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text disabled:opacity-50 disabled:cursor-not-allowed"
                                />
                            </div>

                            <div>
                                <label className="block text-small font-medium text-gray-700 dark:text-kick-text-secondary mb-2">
                                    Total tickets cap
                                </label>
                                <input
                                    type="number"
                                    disabled={hasEntries}
                                    min="1"
                                    value={formData.total_tickets_cap}
                                    onChange={(e) => setFormData({ ...formData, total_tickets_cap: e.target.value })}
                                    placeholder="1000"
                                    className="w-full px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text disabled:opacity-50 disabled:cursor-not-allowed"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Schedule */}
                    <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6">
                        <h2 className="text-h3 font-semibold text-gray-900 dark:text-kick-text mb-4">
                            Schedule
                        </h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-small font-medium text-gray-700 dark:text-kick-text-secondary mb-2">
                                    Start Date & Time {!hasEntries && '*'}
                                </label>
                                <input
                                    type="datetime-local"
                                    required={!hasEntries}
                                    disabled={hasEntries}
                                    value={formData.start_at}
                                    onChange={(e) => setFormData({ ...formData, start_at: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text disabled:opacity-50 disabled:cursor-not-allowed"
                                />
                            </div>

                            <div>
                                <label className="block text-small font-medium text-gray-700 dark:text-kick-text-secondary mb-2">
                                    End Date & Time *
                                </label>
                                <input
                                    type="datetime-local"
                                    required
                                    value={formData.end_at}
                                    onChange={(e) => setFormData({ ...formData, end_at: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Restrictions */}
                    <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6">
                        <h2 className="text-h3 font-semibold text-gray-900 dark:text-kick-text mb-4">
                            Restrictions
                        </h2>
                        <div className="space-y-4">
                            {formData.type !== 'sub_only' && (
                                <div className="flex items-center gap-3">
                                    <input
                                        type="checkbox"
                                        id="sub_only"
                                        disabled={hasEntries}
                                        checked={formData.sub_only}
                                        onChange={(e) => setFormData({ ...formData, sub_only: e.target.checked })}
                                        className="w-4 h-4 text-kick-purple border-gray-300 rounded focus:ring-kick-purple disabled:opacity-50"
                                    />
                                    <label htmlFor="sub_only" className="text-body text-gray-900 dark:text-kick-text">
                                        Limit to Kick subscribers only
                                    </label>
                                </div>
                            )}

                            <div className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    id="hidden_until_start"
                                    checked={formData.hidden_until_start}
                                    onChange={(e) => setFormData({ ...formData, hidden_until_start: e.target.checked })}
                                    className="w-4 h-4 text-kick-purple border-gray-300 rounded focus:ring-kick-purple"
                                />
                                <label htmlFor="hidden_until_start" className="text-body text-gray-900 dark:text-kick-text">
                                    Hide raffle from users until start time
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3">
                        <button
                            type="submit"
                            disabled={saving}
                            className="flex-1 px-6 py-3 bg-kick-purple text-white rounded-lg hover:bg-kick-purple-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {saving ? 'Updating...' : 'Update Raffle'}
                        </button>
                        <button
                            type="button"
                            onClick={() => router.back()}
                            className="px-6 py-3 border border-gray-300 dark:border-kick-border rounded-lg text-gray-700 dark:text-kick-text hover:bg-gray-50 dark:hover:bg-kick-surface-hover transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            </div>

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
