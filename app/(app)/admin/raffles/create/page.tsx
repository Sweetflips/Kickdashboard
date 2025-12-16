'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Toast } from '@/components/Toast'
import { ADVENT_ITEMS } from '@/lib/advent-calendar'

type ExtraEntryDraft = { usernameOrKickId: string; tickets: number }

export default function CreateRafflePage() {
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [isAdmin, setIsAdmin] = useState(false)
    const [saving, setSaving] = useState(false)
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

    const [selectedAdventItemId, setSelectedAdventItemId] = useState<string>('')
    const [seedFromAdventPurchases, setSeedFromAdventPurchases] = useState<boolean>(true)
    const [extraEntriesEnabled, setExtraEntriesEnabled] = useState<boolean>(false)
    const [extraEntries, setExtraEntries] = useState<ExtraEntryDraft[]>([])

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
        number_of_winners: '1',
        wheel_background_url: '',
        center_logo_url: '/icons/Sweetflipscoin.png',
        slice_opacity: '0.5',
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

            const extra_entries = extraEntriesEnabled
                ? extraEntries
                      .filter(e => e.usernameOrKickId.trim().length > 0 && Number(e.tickets) > 0)
                      .map(e => ({ usernameOrKickId: e.usernameOrKickId.trim(), tickets: Number(e.tickets) }))
                : []

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
                    number_of_winners: formData.number_of_winners ? parseInt(formData.number_of_winners) : 1,
                    wheel_background_url: formData.wheel_background_url?.trim() || null,
                    center_logo_url: formData.center_logo_url?.trim() || null,
                    slice_opacity: formData.slice_opacity,
                    seed_advent_item_id: selectedAdventItemId || null,
                    seed_advent_purchases: seedFromAdventPurchases === true,
                    extra_entries,
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

    const applyAdventTemplate = (itemId: string) => {
        const item = ADVENT_ITEMS.find(i => i.id === itemId)
        if (!item) return

        // Auto-fill dates: start today at current time, end tomorrow at end of day
        const now = new Date()
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())
        const tomorrow = new Date(today)
        tomorrow.setDate(tomorrow.getDate() + 1)
        tomorrow.setHours(23, 59, 0, 0)

        // Format for datetime-local input (YYYY-MM-DDTHH:mm)
        const formatDateTimeLocal = (date: Date) => {
            const year = date.getFullYear()
            const month = String(date.getMonth() + 1).padStart(2, '0')
            const day = String(date.getDate()).padStart(2, '0')
            const hours = String(date.getHours()).padStart(2, '0')
            const minutes = String(date.getMinutes()).padStart(2, '0')
            return `${year}-${month}-${day}T${hours}:${minutes}`
        }

        setSelectedAdventItemId(itemId)
        setFormData(prev => ({
            ...prev,
            title: prev.title || `Advent Day ${item.day} Raffle`,
            type: 'special',
            ticket_cost: String(item.pointsCost),
            max_tickets_per_user: String(item.maxTickets),
            wheel_background_url: item.image,
            center_logo_url: prev.center_logo_url || '/icons/Sweetflipscoin.png',
            slice_opacity: prev.slice_opacity || '0.5',
            start_at: prev.start_at || formatDateTimeLocal(today),
            end_at: prev.end_at || formatDateTimeLocal(tomorrow),
        }))
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
                    {/* Quick Create (Shop / Advent) */}
                    <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6">
                        <h2 className="text-h3 font-semibold text-gray-900 dark:text-kick-text mb-4">
                            Quick Create (Shop / Advent)
                        </h2>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="md:col-span-2">
                                <label className="block text-small font-medium text-gray-700 dark:text-kick-text-secondary mb-2">
                                    Advent item
                                </label>
                                <select
                                    value={selectedAdventItemId}
                                    onChange={(e) => {
                                        const nextId = e.target.value
                                        if (!nextId) {
                                            setSelectedAdventItemId('')
                                            return
                                        }
                                        applyAdventTemplate(nextId)
                                    }}
                                    className="w-full px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text"
                                >
                                    <option value="">-- Select an Advent item (optional) --</option>
                                    {[...ADVENT_ITEMS]
                                        .sort((a, b) => a.day - b.day)
                                        .map((item) => (
                                            <option key={item.id} value={item.id}>
                                                Day {item.day} ({item.id}) — {item.pointsCost} SweetCoins — max {item.maxTickets}
                                            </option>
                                        ))}
                                </select>
                                <p className="mt-1 text-xs text-gray-500 dark:text-kick-text-muted">
                                    Selecting one auto-fills ticket cost, max tickets, and wheel background.
                                </p>
                            </div>

                            <div className="flex items-center gap-3 mt-7">
                                <input
                                    type="checkbox"
                                    id="seed_from_advent"
                                    checked={seedFromAdventPurchases}
                                    onChange={(e) => setSeedFromAdventPurchases(e.target.checked)}
                                    className="w-4 h-4 text-kick-purple border-gray-300 rounded focus:ring-kick-purple"
                                    disabled={!selectedAdventItemId}
                                />
                                <label htmlFor="seed_from_advent" className="text-body text-gray-900 dark:text-kick-text">
                                    Seed entries from purchases
                                </label>
                            </div>
                        </div>
                    </div>

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
                                    <span className="text-body text-gray-600 dark:text-kick-text-secondary">SweetCoins</span>
                                </div>
                                <p className="mt-1 text-xs text-gray-500 dark:text-kick-text-muted">
                                    How many SweetCoins users spend per entry.
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

                    {/* Wheel + Winners */}
                    <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6">
                        <h2 className="text-h3 font-semibold text-gray-900 dark:text-kick-text mb-4">
                            Wheel + Winners
                        </h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-small font-medium text-gray-700 dark:text-kick-text-secondary mb-2">
                                    Number of winners
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    value={formData.number_of_winners}
                                    onChange={(e) => setFormData({ ...formData, number_of_winners: e.target.value })}
                                    className="w-32 px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text"
                                />
                            </div>

                            <div>
                                <label className="block text-small font-medium text-gray-700 dark:text-kick-text-secondary mb-2">
                                    Wheel background URL (optional)
                                </label>
                                <input
                                    type="text"
                                    value={formData.wheel_background_url}
                                    onChange={(e) => setFormData({ ...formData, wheel_background_url: e.target.value })}
                                    placeholder="/advent/Day 14.png"
                                    className="w-full px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text"
                                />
                            </div>

                            <div>
                                <label className="block text-small font-medium text-gray-700 dark:text-kick-text-secondary mb-2">
                                    Center logo URL (optional)
                                </label>
                                <input
                                    type="text"
                                    value={formData.center_logo_url}
                                    onChange={(e) => setFormData({ ...formData, center_logo_url: e.target.value })}
                                    placeholder="/icons/Sweetflipscoin.png"
                                    className="w-full px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text"
                                />
                            </div>

                            <div>
                                <label className="block text-small font-medium text-gray-700 dark:text-kick-text-secondary mb-2">
                                    Slice opacity ({formData.slice_opacity})
                                </label>
                                <input
                                    type="range"
                                    min={0}
                                    max={1}
                                    step={0.05}
                                    value={formData.slice_opacity}
                                    onChange={(e) => setFormData({ ...formData, slice_opacity: e.target.value })}
                                    className="w-full"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Extra people (seed entries) */}
                    <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-h3 font-semibold text-gray-900 dark:text-kick-text">
                                Extra people (seed entries)
                            </h2>
                            <div className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    id="extra_entries_enabled"
                                    checked={extraEntriesEnabled}
                                    onChange={(e) => setExtraEntriesEnabled(e.target.checked)}
                                    className="w-4 h-4 text-kick-purple border-gray-300 rounded focus:ring-kick-purple"
                                />
                                <label htmlFor="extra_entries_enabled" className="text-body text-gray-900 dark:text-kick-text">
                                    Enable
                                </label>
                            </div>
                        </div>

                        {extraEntriesEnabled && (
                            <div className="mt-4 space-y-3">
                                <p className="text-small text-gray-600 dark:text-kick-text-secondary">
                                    Add users by <span className="font-mono">username</span> or <span className="font-mono">kick_user_id</span>. These entries are added without spending SweetCoins.
                                </p>

                                <div className="space-y-2">
                                    {extraEntries.map((entry, idx) => (
                                        <div key={idx} className="flex flex-wrap gap-2 items-center">
                                            <input
                                                value={entry.usernameOrKickId}
                                                onChange={(e) => {
                                                    const next = [...extraEntries]
                                                    next[idx] = { ...next[idx], usernameOrKickId: e.target.value }
                                                    setExtraEntries(next)
                                                }}
                                                placeholder="username or kick_user_id"
                                                className="flex-1 min-w-[240px] px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text"
                                            />
                                            <input
                                                type="number"
                                                min={1}
                                                max={50}
                                                value={entry.tickets}
                                                onChange={(e) => {
                                                    const next = [...extraEntries]
                                                    next[idx] = { ...next[idx], tickets: Number(e.target.value) }
                                                    setExtraEntries(next)
                                                }}
                                                className="w-32 px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setExtraEntries(extraEntries.filter((_, i) => i !== idx))}
                                                className="px-3 py-2 bg-gray-200 dark:bg-kick-surface-hover text-gray-900 dark:text-kick-text rounded-lg hover:bg-gray-300 dark:hover:bg-kick-dark transition-colors"
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setExtraEntries([...extraEntries, { usernameOrKickId: '', tickets: 1 }])}
                                        className="px-4 py-2 bg-kick-purple text-white rounded-lg hover:bg-kick-purple/90 transition-colors"
                                    >
                                        + Add person
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setExtraEntries([])}
                                        className="px-4 py-2 bg-gray-200 dark:bg-kick-surface-hover text-gray-900 dark:text-kick-text rounded-lg hover:bg-gray-300 dark:hover:bg-kick-dark transition-colors"
                                    >
                                        Clear
                                    </button>
                                </div>
                            </div>
                        )}
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
