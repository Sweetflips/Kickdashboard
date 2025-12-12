'use client'

import { Toast } from '@/components/Toast'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

interface PromoCode {
    id: string
    code: string
    points_value: number
    max_uses: number | null
    current_uses: number
    expires_at: string | null
    is_active: boolean
    created_by: string
    created_at: string
    recent_redemptions: Array<{
        username: string
        redeemed_at: string
    }>
}

export default function AdminPromoCodesPage() {
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [isAdmin, setIsAdmin] = useState(false)
    const [promoCodes, setPromoCodes] = useState<PromoCode[]>([])
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

    // Form state
    const [formData, setFormData] = useState({
        code: '',
        points_value: '100',
        max_uses: '',
        expires_at: '',
        quantity: '1',
    })
    const [creating, setCreating] = useState(false)

    useEffect(() => {
        checkAdmin()
    }, [])

    useEffect(() => {
        if (isAdmin) {
            fetchPromoCodes()
        }
    }, [isAdmin])

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

            const data = await response.json()
            if (!data.is_admin) {
                router.push('/')
                return
            }

            setIsAdmin(true)
            setLoading(false)
        } catch (error) {
            router.push('/')
        }
    }

    const fetchPromoCodes = async () => {
        try {
            const token = localStorage.getItem('kick_access_token')
            const response = await fetch('/api/admin/promo-codes', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            })

            if (response.ok) {
                const data = await response.json()
                setPromoCodes(data.codes)
            }
        } catch (error) {
            console.error('Error fetching promo codes:', error)
            setToast({ message: 'Failed to fetch promo codes', type: 'error' })
        }
    }

    const handleCreateCode = async (e: React.FormEvent) => {
        e.preventDefault()
        setCreating(true)

        try {
            const token = localStorage.getItem('kick_access_token')
            const response = await fetch('/api/admin/promo-codes', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    code: formData.code.trim().toUpperCase(),
                    points_value: parseInt(formData.points_value),
                    max_uses: formData.max_uses ? parseInt(formData.max_uses) : null,
                    expires_at: formData.expires_at || null,
                    quantity: parseInt(formData.quantity),
                }),
            })

            const data = await response.json()

            if (response.ok) {
                setToast({ message: data.message, type: 'success' })
                setShowCreateModal(false)
                setFormData({
                    code: '',
                    points_value: '100',
                    max_uses: '',
                    expires_at: '',
                    quantity: '1',
                })
                fetchPromoCodes()
            } else {
                setToast({ message: data.error || 'Failed to create promo code', type: 'error' })
            }
        } catch (error) {
            setToast({ message: 'Failed to create promo code', type: 'error' })
        } finally {
            setCreating(false)
        }
    }

    const toggleCodeStatus = async (id: string, currentStatus: boolean) => {
        try {
            const token = localStorage.getItem('kick_access_token')
            const response = await fetch(`/api/admin/promo-codes?id=${id}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ is_active: !currentStatus }),
            })

            const data = await response.json()

            if (response.ok) {
                setToast({ message: data.message, type: 'success' })
                fetchPromoCodes()
            } else {
                setToast({ message: data.error || 'Failed to update code', type: 'error' })
            }
        } catch (error) {
            setToast({ message: 'Failed to update code', type: 'error' })
        }
    }

    const deleteCode = async (id: string) => {
        if (!confirm('Are you sure you want to delete this code? This cannot be undone.')) {
            return
        }

        try {
            const token = localStorage.getItem('kick_access_token')
            const response = await fetch(`/api/admin/promo-codes?id=${id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            })

            const data = await response.json()

            if (response.ok) {
                setToast({ message: data.message, type: 'success' })
                fetchPromoCodes()
            } else {
                setToast({ message: data.error || 'Failed to delete code', type: 'error' })
            }
        } catch (error) {
            setToast({ message: 'Failed to delete code', type: 'error' })
        }
    }

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return 'Never'
        const date = new Date(dateStr)
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })
    }

    const getStatusColor = (code: PromoCode) => {
        if (!code.is_active) return 'bg-gray-500'
        if (code.expires_at && new Date(code.expires_at) < new Date()) return 'bg-red-500'
        if (code.max_uses && code.current_uses >= code.max_uses) return 'bg-orange-500'
        return 'bg-green-500'
    }

    const getStatusText = (code: PromoCode) => {
        if (!code.is_active) return 'Inactive'
        if (code.expires_at && new Date(code.expires_at) < new Date()) return 'Expired'
        if (code.max_uses && code.current_uses >= code.max_uses) return 'Used Up'
        return 'Active'
    }

    if (loading || !isAdmin) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kick-purple"></div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-h1 font-semibold text-gray-900 dark:text-kick-text">
                            Promo Codes
                        </h1>
                        <p className="text-body text-gray-600 dark:text-kick-text-secondary mt-1">
                            Create and manage promotional codes for bonus points
                        </p>
                    </div>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="px-4 py-2 bg-kick-purple text-white rounded-lg hover:bg-kick-purple-dark transition-colors font-medium"
                    >
                        + Create Code
                    </button>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-4">
                        <p className="text-small text-gray-600 dark:text-kick-text-secondary mb-1">Total Codes</p>
                        <p className="text-h3 font-bold text-gray-900 dark:text-kick-text">{promoCodes.length}</p>
                    </div>
                    <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-4">
                        <p className="text-small text-gray-600 dark:text-kick-text-secondary mb-1">Active Codes</p>
                        <p className="text-h3 font-bold text-green-600">{promoCodes.filter(c => c.is_active && (!c.expires_at || new Date(c.expires_at) > new Date())).length}</p>
                    </div>
                    <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-4">
                        <p className="text-small text-gray-600 dark:text-kick-text-secondary mb-1">Total Redemptions</p>
                        <p className="text-h3 font-bold text-kick-purple">{promoCodes.reduce((sum, code) => sum + code.current_uses, 0)}</p>
                    </div>
                    <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-4">
                        <p className="text-small text-gray-600 dark:text-kick-text-secondary mb-1">Points Given</p>
                        <p className="text-h3 font-bold text-amber-600">{promoCodes.reduce((sum, code) => sum + (code.current_uses * code.points_value), 0).toLocaleString()}</p>
                    </div>
                </div>

                {/* Promo Codes Table */}
                <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 dark:bg-kick-dark border-b border-gray-200 dark:border-kick-border">
                                <tr>
                                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-kick-text-secondary">Code</th>
                                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-kick-text-secondary">Points</th>
                                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-kick-text-secondary">Usage</th>
                                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-kick-text-secondary">Expires</th>
                                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-kick-text-secondary">Status</th>
                                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-kick-text-secondary">Created</th>
                                    <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-kick-text-secondary">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {promoCodes.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="py-12 text-center text-gray-500 dark:text-kick-text-secondary">
                                            No promo codes yet. Create one to get started!
                                        </td>
                                    </tr>
                                ) : (
                                    promoCodes.map((code) => (
                                        <tr key={code.id} className="border-b border-gray-100 dark:border-kick-border hover:bg-gray-50 dark:hover:bg-kick-dark transition-colors">
                                            <td className="py-4 px-4">
                                                <div className="font-mono font-bold text-gray-900 dark:text-kick-text">{code.code}</div>
                                                <div className="text-xs text-gray-500 dark:text-kick-text-muted">by {code.created_by}</div>
                                            </td>
                                            <td className="py-4 px-4">
                                                <span className="font-bold text-kick-purple">{code.points_value.toLocaleString()}</span>
                                            </td>
                                            <td className="py-4 px-4">
                                                <div className="text-gray-900 dark:text-kick-text">
                                                    {code.current_uses} {code.max_uses ? `/ ${code.max_uses}` : '/ ∞'}
                                                </div>
                                                {code.max_uses && code.current_uses >= code.max_uses && (
                                                    <div className="text-xs text-orange-600">Full</div>
                                                )}
                                            </td>
                                            <td className="py-4 px-4 text-gray-900 dark:text-kick-text text-sm">
                                                {formatDate(code.expires_at)}
                                            </td>
                                            <td className="py-4 px-4">
                                                <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium text-white ${getStatusColor(code)}`}>
                                                    <span className="w-1.5 h-1.5 bg-white rounded-full"></span>
                                                    {getStatusText(code)}
                                                </span>
                                            </td>
                                            <td className="py-4 px-4 text-gray-900 dark:text-kick-text text-sm">
                                                {formatDate(code.created_at)}
                                            </td>
                                            <td className="py-4 px-4">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => toggleCodeStatus(code.id, code.is_active)}
                                                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                                                            code.is_active
                                                                ? 'bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-400'
                                                                : 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400'
                                                        }`}
                                                    >
                                                        {code.is_active ? 'Deactivate' : 'Activate'}
                                                    </button>
                                                    {code.current_uses === 0 && (
                                                        <button
                                                            onClick={() => deleteCode(code.id)}
                                                            className="px-3 py-1 bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 rounded text-xs font-medium transition-colors"
                                                        >
                                                            Delete
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Create Modal */}
                {showCreateModal && (
                    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                        <div className="bg-white dark:bg-kick-surface rounded-xl max-w-md w-full p-6 shadow-xl">
                            <h2 className="text-h3 font-semibold text-gray-900 dark:text-kick-text mb-4">Create Promo Code</h2>

                            <form onSubmit={handleCreateCode} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-kick-text-secondary mb-1">
                                        Code *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.code}
                                        onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text font-mono"
                                        placeholder="SUMMER2024"
                                        maxLength={50}
                                    />
                                    <p className="text-xs text-gray-500 dark:text-kick-text-muted mt-1">
                                        Alphanumeric only. Will be converted to uppercase.
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-kick-text-secondary mb-1">
                                        Points Value *
                                    </label>
                                    <input
                                        type="number"
                                        required
                                        min="1"
                                        max="1000000"
                                        value={formData.points_value}
                                        onChange={(e) => setFormData({ ...formData, points_value: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-kick-text-secondary mb-1">
                                        Max Uses (optional)
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={formData.max_uses}
                                        onChange={(e) => setFormData({ ...formData, max_uses: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text"
                                        placeholder="Unlimited"
                                    />
                                    <p className="text-xs text-gray-500 dark:text-kick-text-muted mt-1">
                                        Leave empty for unlimited uses
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-kick-text-secondary mb-1">
                                        Expiration Date (optional)
                                    </label>
                                    <input
                                        type="datetime-local"
                                        value={formData.expires_at}
                                        onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-kick-text-secondary mb-1">
                                        Quantity (bulk generation)
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="100"
                                        value={formData.quantity}
                                        onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text"
                                    />
                                    <p className="text-xs text-gray-500 dark:text-kick-text-muted mt-1">
                                        Create multiple codes with random suffixes (max 100)
                                    </p>
                                </div>

                                <div className="flex gap-3 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowCreateModal(false)}
                                        className="flex-1 px-4 py-2 bg-gray-200 dark:bg-kick-dark text-gray-700 dark:text-kick-text rounded-lg hover:bg-gray-300 dark:hover:bg-kick-surface-hover transition-colors font-medium"
                                        disabled={creating}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="flex-1 px-4 py-2 bg-kick-purple text-white rounded-lg hover:bg-kick-purple-dark transition-colors font-medium disabled:opacity-50"
                                        disabled={creating}
                                    >
                                        {creating ? 'Creating...' : 'Create'}
                                    </button>
                                </div>
                            </form>
                        </div>
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
