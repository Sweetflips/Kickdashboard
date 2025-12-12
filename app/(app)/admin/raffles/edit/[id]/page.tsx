'use client'

import { Toast } from '@/components/Toast'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function EditRafflePage() {
    const router = useRouter()
    const params = useParams()
    const raffleId = params.id as string

    const [loading, setLoading] = useState(true)
    const [isAdmin, setIsAdmin] = useState(false)
    const [saving, setSaving] = useState(false)
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
    const [hasEntries, setHasEntries] = useState(false)
    const [numberOfWinners, setNumberOfWinners] = useState(1)
    const [riggingEnabled, setRiggingEnabled] = useState(false)
    const [rigSlots, setRigSlots] = useState<(string | null)[]>([null, null, null, null, null])
    const [entriesList, setEntriesList] = useState<any[]>([])
    const [manualUserId, setManualUserId] = useState('')
    const [manualTicketsCount, setManualTicketsCount] = useState(1)

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
        wheel_background_url: '',
        center_logo_url: '',
        slice_opacity: '0.5',
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
                    wheel_background_url: raffle.wheel_background_url || '',
                    center_logo_url: raffle.center_logo_url || '',
                    slice_opacity: raffle.slice_opacity?.toString() || '0.5',
                })
                setNumberOfWinners(raffle.number_of_winners || 1)
                setRiggingEnabled(raffle.rigging_enabled || false)

                // load entries for dropdowns
                const entriesResp = await fetch(`/api/raffles/${raffleId}/entries`)
                if (entriesResp.ok) {
                    const ed = await entriesResp.json()
                    setEntriesList(ed.entries || [])
                }
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
                    number_of_winners: numberOfWinners,
                    rigging_enabled: riggingEnabled,
                    wheel_background_url: formData.wheel_background_url || null,
                    center_logo_url: formData.center_logo_url || null,
                    slice_opacity: formData.slice_opacity,
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
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kick-purple"></div>
            </div>
        )
    }

    return (
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

                            {/* Raffle Options */}
                            <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6">
                                <h2 className="text-h3 font-semibold text-gray-900 dark:text-kick-text mb-4">Raffle Options</h2>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-small font-medium text-gray-700 dark:text-kick-text-secondary mb-2">Number of Winners</label>
                                        <input type="number" min={1} value={numberOfWinners} onChange={(e) => setNumberOfWinners(Number(e.target.value))} className="w-24 px-3 py-2 border rounded" />
                                    </div>
                                    <div>
                                        <label className="block text-small font-medium text-gray-700 dark:text-kick-text-secondary mb-2">Wheel Background URL</label>
                                        <input type="text" value={formData.wheel_background_url} onChange={(e) => setFormData({ ...formData, wheel_background_url: e.target.value })} className="w-full px-3 py-2 border rounded" />
                                    </div>
                                    <div>
                                        <label className="block text-small font-medium text-gray-700 dark:text-kick-text-secondary mb-2">Center Logo URL</label>
                                        <input type="text" value={formData.center_logo_url} onChange={(e) => setFormData({ ...formData, center_logo_url: e.target.value })} className="w-full px-3 py-2 border rounded" />
                                    </div>
                                    <div>
                                        <label className="block text-small font-medium text-gray-700 dark:text-kick-text-secondary mb-2">Slice Opacity</label>
                                        <input type="range" min={0} max={1} step={0.05} value={formData.slice_opacity} onChange={(e) => setFormData({ ...formData, slice_opacity: e.target.value })} className="w-full" />
                                        <div className="text-small text-gray-500">Opacity: {formData.slice_opacity}</div>
                                    </div>

                                    {/* Manual Tickets & Users */}
                                    <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6">
                                        <h2 className="text-h3 font-semibold text-gray-900 dark:text-kick-text mb-4">Manual Tickets & Users</h2>
                                        <div className="space-y-4">
                                            <div className="flex gap-2 items-center">
                                                <input placeholder="User ID (kick id)" value={manualUserId} onChange={(e) => setManualUserId(e.target.value)} className="px-3 py-2 border rounded w-48" />
                                                <input type="number" min={1} max={50} value={manualTicketsCount} onChange={(e) => setManualTicketsCount(Number(e.target.value))} className="px-3 py-2 border rounded w-32" />
                                                <button type="button" className="px-3 py-2 bg-blue-600 text-white rounded" onClick={async () => {
                                                    if (!manualUserId) { setToast({ message: 'Please enter a user ID', type: 'error' }); return }
                                                    const token = localStorage.getItem('kick_access_token')
                                                    const resp = await fetch(`/api/raffles/${raffleId}/entries/manual`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ userId: manualUserId, tickets: manualTicketsCount }) })
                                                    if (resp.ok) {
                                                        setToast({ message: 'Manual tickets added', type: 'success' })
                                                        // refresh entries list
                                                        const entriesResp = await fetch(`/api/raffles/${raffleId}/entries`)
                                                        if (entriesResp.ok) {
                                                            const ed = await entriesResp.json(); setEntriesList(ed.entries || [])
                                                        }
                                                    } else { const e = await resp.json(); setToast({ message: e.error || 'Failed to add manual tickets', type: 'error' }) }
                                                }}>Add Tickets</button>
                                            </div>
                                            <div>
                                                <p className="text-small text-gray-500">Current entries: {entriesList.length}</p>
                                            </div>
                                        </div>

                                        {/* Entries List */}
                                        <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6">
                                            <h2 className="text-h3 font-semibold text-gray-900 dark:text-kick-text mb-4">Ticket Entries</h2>
                                            <div className="max-h-64 overflow-y-auto">
                                                {entriesList.length === 0 ? (
                                                    <p className="text-small text-gray-500">No entries</p>
                                                ) : (
                                                    <div className="space-y-2">
                                                        {entriesList.map((e) => (
                                                            <div key={e.entry_id} className="border rounded p-2">
                                                                <div className="font-semibold">{e.username} <span className="text-small text-gray-500">({e.tickets} tickets)</span></div>
                                                                <div className="mt-2 space-y-1">
                                                                    {Array.from({ length: e.tickets }).map((_, idx) => (
                                                                        <div key={`${e.entry_id}-${idx}`} className="flex items-center justify-between p-2 border rounded">
                                                                            <div className="text-small">Ticket #{idx + 1}</div>
                                                                            <div className="flex gap-2">
                                                                                <button type="button" onClick={async () => {
                                                                                    const token = localStorage.getItem('kick_access_token')
                                                                                    const resp = await fetch(`/api/raffles/${raffleId}/entries/${e.entry_id}/remove`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ count: 1 }) })
                                                                                    if (resp.ok) { setToast({ message: 'Ticket removed', type: 'success' }); const entriesResp = await fetch(`/api/raffles/${raffleId}/entries`); const data = await entriesResp.json(); setEntriesList(data.entries || []) }
                                                                                }} className="px-2 py-1 bg-gray-200 rounded">Remove</button>
                                                                                <button type="button" onClick={async () => {
                                                                                    if (!confirm('Remove all instances for this user?')) return
                                                                                    const token = localStorage.getItem('kick_access_token')
                                                                                    const resp = await fetch(`/api/raffles/${raffleId}/entries/${e.entry_id}/remove-all`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
                                                                                    if (resp.ok) { setToast({ message: 'All instances removed', type: 'success' }); const entriesResp = await fetch(`/api/raffles/${raffleId}/entries`); const data = await entriesResp.json(); setEntriesList(data.entries || []) }
                                                                                }} className="px-2 py-1 bg-red-500 text-white rounded">Remove all</button>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <input type="checkbox" id="rigging_enabled" checked={riggingEnabled} onChange={(e) => setRiggingEnabled(e.target.checked)} className="w-4 h-4" />
                                        <label htmlFor="rigging_enabled" className="text-body text-gray-900 dark:text-kick-text">Enable predefined winners (Rigging)</label>
                                    </div>
                                    {riggingEnabled && (
                                        <div className="space-y-2">
                                            {[0,1,2,3,4].map(i => (
                                                <div key={i} className="flex items-center gap-2">
                                                    <label className="w-20">Winner #{i+1}</label>
                                                    <select value={rigSlots[i] || ''} onChange={(e) => { const newSlots = [...rigSlots]; newSlots[i] = e.target.value || null; setRigSlots(newSlots) }} className="flex-1 px-3 py-2 border rounded">
                                                        <option value="">-- None --</option>
                                                        {entriesList.map(entry => (
                                                            <option key={entry.entry_id} value={entry.entry_id}>{entry.username} ({entry.tickets})</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            ))}
                                            <div>
                                                <button type="button" onClick={async () => {
                                                    const token = localStorage.getItem('kick_access_token')
                                                    const resp = await fetch(`/api/raffles/${raffleId}/rigging`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ rigging_enabled: riggingEnabled, rigs: rigSlots.filter(Boolean) }) })
                                                    if (resp.ok) setToast({ message: 'Rigging updated', type: 'success' }); else setToast({ message: 'Failed to update rigging', type: 'error' })
                                                }} className="px-3 py-1 bg-blue-600 text-white rounded">Save Rigging</button>
                                            </div>
                                        </div>
                                    )}
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
        </div>
    )
}
