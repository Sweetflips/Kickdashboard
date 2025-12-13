'use client'

import { useState } from 'react'
import { getClientAccessToken } from '@/lib/auth-client'

interface PromoCodeModalProps {
    isOpen: boolean
    onClose: () => void
    onSuccess: (points: number) => void
}

export default function PromoCodeModal({ isOpen, onClose, onSuccess }: PromoCodeModalProps) {
    const [code, setCode] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    if (!isOpen) return null

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            const token = getClientAccessToken()
            const response = await fetch('/api/promo-codes/redeem', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ code: code.trim() }),
            })

            const data = await response.json()

            if (response.ok) {
                onSuccess(data.points_awarded)
                setCode('')
                setTimeout(() => onClose(), 2000) // Close after 2 seconds
            } else {
                setError(data.error || 'Failed to redeem code')
            }
        } catch (err) {
            setError('Failed to redeem code. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div
                className="bg-white dark:bg-kick-surface rounded-xl max-w-md w-full p-6 shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-h3 font-semibold text-gray-900 dark:text-kick-text">Redeem Promo Code</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700 dark:text-kick-text-secondary dark:hover:text-kick-text"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-kick-text-secondary mb-2">
                            Enter your promo code
                        </label>
                        <input
                            type="text"
                            value={code}
                            onChange={(e) => setCode(e.target.value.toUpperCase())}
                            placeholder="PROMO-CODE-HERE"
                            className="w-full px-4 py-3 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text font-mono text-lg focus:ring-2 focus:ring-kick-purple focus:border-transparent"
                            maxLength={50}
                            required
                            disabled={loading}
                            autoFocus
                        />
                        {error && (
                            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
                        )}
                    </div>

                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                        <p className="text-sm text-blue-800 dark:text-blue-300">
                            💡 Promo codes can be found during streams, special events, or social media announcements!
                        </p>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 bg-gray-200 dark:bg-kick-dark text-gray-700 dark:text-kick-text rounded-lg hover:bg-gray-300 dark:hover:bg-kick-surface-hover transition-colors font-medium"
                            disabled={loading}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="flex-1 px-4 py-2 bg-kick-purple text-white rounded-lg hover:bg-kick-purple-dark transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={loading || !code.trim()}
                        >
                            {loading ? 'Redeeming...' : 'Redeem'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
