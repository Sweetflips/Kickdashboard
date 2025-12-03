'use client'

import { useState, useEffect } from 'react'

interface BuyTicketsModalProps {
    isOpen: boolean
    onClose: () => void
    raffle: {
        id: string
        title: string
        prize_description: string
        ticket_cost: number
        max_tickets_per_user?: number | null
        user_tickets: number
    } | null
    userBalance: number
    onPurchase: (quantity: number) => Promise<void>
}

export default function BuyTicketsModal({
    isOpen,
    onClose,
    raffle,
    userBalance,
    onPurchase,
}: BuyTicketsModalProps) {
    const [quantity, setQuantity] = useState(1)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (isOpen) {
            setQuantity(1)
            setError(null)
        }
    }, [isOpen])

    if (!isOpen || !raffle) return null

    const maxTickets = raffle.max_tickets_per_user
        ? raffle.max_tickets_per_user - raffle.user_tickets
        : null

    const totalCost = raffle.ticket_cost * quantity
    const canAfford = userBalance >= totalCost
    const exceedsMax = maxTickets !== null && quantity > maxTickets
    const exceedsBalance = totalCost > userBalance

    const handlePurchase = async () => {
        if (quantity <= 0) {
            setError('Quantity must be greater than 0')
            return
        }

        if (exceedsMax) {
            setError(`You cannot buy more than ${maxTickets} tickets for this raffle.`)
            return
        }

        if (exceedsBalance) {
            setError('Not enough points. Reduce the number of tickets or earn more points during stream.')
            return
        }

        setLoading(true)
        setError(null)

        try {
            await onPurchase(quantity)
            onClose()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to purchase tickets')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
            <div
                className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6 max-w-md w-full mx-4"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-h3 font-semibold text-gray-900 dark:text-kick-text">
                        Buy tickets – {raffle.title}
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-500 dark:text-kick-text-secondary hover:text-gray-700 dark:hover:text-kick-text"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <p className="text-body text-gray-900 dark:text-kick-text">
                            {raffle.title} · {raffle.prize_description}
                        </p>
                    </div>

                    <div>
                        <p className="text-body text-gray-900 dark:text-kick-text">
                            You have {userBalance.toLocaleString()} points.
                        </p>
                    </div>

                    <div>
                        <p className="text-body text-gray-900 dark:text-kick-text">
                            Cost per ticket: {raffle.ticket_cost} points
                        </p>
                    </div>

                    <div>
                        <label className="block text-small font-medium text-gray-700 dark:text-kick-text-secondary mb-2">
                            Number of tickets
                        </label>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                disabled={quantity <= 1 || loading}
                                className="px-3 py-2 border border-gray-300 dark:border-kick-border rounded-lg hover:bg-gray-50 dark:hover:bg-kick-surface-hover disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                -
                            </button>
                            <input
                                type="number"
                                value={quantity}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value) || 1
                                    setQuantity(Math.max(1, val))
                                }}
                                min={1}
                                max={maxTickets || undefined}
                                disabled={loading}
                                className="flex-1 px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text text-center"
                            />
                            <button
                                onClick={() => {
                                    if (maxTickets === null || quantity < maxTickets) {
                                        setQuantity(quantity + 1)
                                    }
                                }}
                                disabled={(maxTickets !== null && quantity >= maxTickets) || loading}
                                className="px-3 py-2 border border-gray-300 dark:border-kick-border rounded-lg hover:bg-gray-50 dark:hover:bg-kick-surface-hover disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                +
                            </button>
                        </div>
                        {maxTickets !== null && (
                            <p className="mt-1 text-xs text-gray-500 dark:text-kick-text-muted">
                                Maximum {raffle.max_tickets_per_user} tickets per user for this raffle.
                            </p>
                        )}
                    </div>

                    <div>
                        <div className="flex items-center justify-between">
                            <span className="text-body font-medium text-gray-900 dark:text-kick-text">
                                Total
                            </span>
                            <span className="text-body font-semibold text-gray-900 dark:text-kick-text">
                                {totalCost.toLocaleString()} points
                            </span>
                        </div>
                    </div>

                    {error && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                            <p className="text-small text-red-600 dark:text-red-400">{error}</p>
                        </div>
                    )}
                </div>

                <div className="mt-6 flex gap-3">
                    <button
                        onClick={handlePurchase}
                        disabled={loading || exceedsMax || exceedsBalance || quantity <= 0}
                        className="flex-1 px-4 py-2 bg-kick-purple text-white rounded-lg hover:bg-kick-purple-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {loading ? 'Processing...' : 'Confirm purchase'}
                    </button>
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className="px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg text-gray-700 dark:text-kick-text hover:bg-gray-50 dark:hover:bg-kick-surface-hover disabled:opacity-50 transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    )
}
