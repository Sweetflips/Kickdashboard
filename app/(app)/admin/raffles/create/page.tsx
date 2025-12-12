'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Toast } from '@/components/Toast'

export default function CreateRafflePage() {
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [isAdmin, setIsAdmin] = useState(false)
    const [saving, setSaving] = useState(false)
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        setToast(null)

        try {
            const token = localStorage.getItem('kick_access_token')
            if (!token) return

            const response = await fetch('/api/raffles', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    ...formData,
                    ticket_cost: parseInt(formData.ticket_cost),
                    max_tickets_per_user: formData.max_tickets_per_user ? parseInt(formData.max_tickets_per_user) : null,
                    total_tickets_cap: formData.total_tickets_cap ? parseInt(formData.total_tickets_cap) : null,
                    claim_message: formData.claim_message.trim() || null,
                }),
            })

            if (response.ok) {
                setToast({ message: 'Raffle created successfully.', type: 'success' })
                setTimeout(() => {
                    router.push('/admin/raffles')
                }, 1000)
            } else {
                const error = await response.json()
                setToast({ message: error.error || 'Failed to create raffle. Please check your fields.', type: 'error' })
            }
        } catch (error) {
            console.error('Error creating raffle:', error)
            setToast({ message: 'Failed to create raffle. Please check your fields.', type: 'error' })
        } finally {
            setSaving(false)
        }
    }

    if (loading || !isAdmin) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kick-purple"></div>
            </div>
        )
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6">
                <div>
                    <h1 className="text-h1 font-semibold text-gray-900 dark:text-kick-text">
                        Create New Raffle
                    </h1>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Raffle Details */}
                    <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6">
                        <h2 className="text-h3 font-semibold text-gray-900 dark:text-kick-text mb-4">
                            Raffle Details
                        </h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-small font-medium text-gray-700 dark:text-kick-text-secondary mb-2">
                                    Raffle Title *
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                    placeholder="Weekly $10 Gift Card"
                                    className="w-full px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text"
                                />
                                <p className="mt-1 text-xs text-gray-500 dark:text-kick-text-muted">
                                    What users will see on the Raffles page.
                                </p>
                            </div>

                            <div>
                                <label className="block text-small font-medium text-gray-700 dark:text-kick-text-secondary mb-2">
                                    Description (optional)
                                </label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="This raffle rewards 5 winners with $10 USDT tips."
                                    rows={3}
                                    className="w-full px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text"
                                />
                                <p className="mt-1 text-xs text-gray-500 dark:text-kick-text-muted">
                                    Shows in the Details modal.
                                </p>
                            </div>

                            <div>
                                <label className="block text-small font-medium text-gray-700 dark:text-kick-text-secondary mb-2">
                                    Raffle Type
                                </label>
                                <select
                                    value={formData.type}
                                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text"
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
                                    Prize Description *
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.prize_description}
                                    onChange={(e) => setFormData({ ...formData, prize_description: e.target.value })}
                                    placeholder="$10 USDT tip (5 winners)"
                                    className="w-full px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text"
                                />
                                <p className="mt-1 text-xs text-gray-500 dark:text-kick-text-muted">
                                    Displayed to users on the raffle card.
                                </p>
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
                                    Cost per ticket *
                                </label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        required
                                        min="1"
                                        value={formData.ticket_cost}
                                        onChange={(e) => setFormData({ ...formData, ticket_cost: e.target.value })}
                                        placeholder="50"
                                        className="flex-1 px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text"
                                    />
                                    <span className="text-body text-gray-600 dark:text-kick-text-secondary">points</span>
                                </div>
                                <p className="mt-1 text-xs text-gray-500 dark:text-kick-text-muted">
                                    How many points users spend per entry.
                                </p>
                            </div>

                            <div>
                                <label className="block text-small font-medium text-gray-700 dark:text-kick-text-secondary mb-2">
                                    Max tickets per user
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    value={formData.max_tickets_per_user}
                                    onChange={(e) => setFormData({ ...formData, max_tickets_per_user: e.target.value })}
                                    placeholder="5"
                                    className="w-full px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text"
                                />
                                <p className="mt-1 text-xs text-gray-500 dark:text-kick-text-muted">
                                    Leave blank for no limit.
                                </p>
                            </div>

                            <div>
                                <label className="block text-small font-medium text-gray-700 dark:text-kick-text-secondary mb-2">
                                    Total tickets cap
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    value={formData.total_tickets_cap}
                                    onChange={(e) => setFormData({ ...formData, total_tickets_cap: e.target.value })}
                                    placeholder="1000"
                                    className="w-full px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text"
                                />
                                <p className="mt-1 text-xs text-gray-500 dark:text-kick-text-muted">
                                    Maximum number of tickets that can be sold. Leave blank for unlimited.
                                </p>
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
                                    Start Date & Time *
                                </label>
                                <input
                                    type="datetime-local"
                                    required
                                    value={formData.start_at}
                                    onChange={(e) => setFormData({ ...formData, start_at: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text"
                                />
                                <p className="mt-1 text-xs text-gray-500 dark:text-kick-text-muted">
                                    When users can begin entering.
                                </p>
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
                                <p className="mt-1 text-xs text-gray-500 dark:text-kick-text-muted">
                                    When the raffle closes automatically.
                                </p>
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
                                        checked={formData.sub_only}
                                        onChange={(e) => setFormData({ ...formData, sub_only: e.target.checked })}
                                        className="w-4 h-4 text-kick-purple border-gray-300 rounded focus:ring-kick-purple"
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
                            {saving ? 'Creating...' : 'Create Raffle'}
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
        </div>
    )
}
