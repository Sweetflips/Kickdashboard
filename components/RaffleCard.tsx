'use client'

import { useState } from 'react'
import BuyTicketsModal from './BuyTicketsModal'
import RaffleDetailsModal from './RaffleDetailsModal'

interface RaffleCardProps {
    raffle: {
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
    userBalance: number
    isSubscriber: boolean
    onPurchase: (raffleId: string, quantity: number) => Promise<void>
}

export default function RaffleCard({ raffle, userBalance, isSubscriber, onPurchase }: RaffleCardProps) {
    const [showBuyModal, setShowBuyModal] = useState(false)
    const [showDetailsModal, setShowDetailsModal] = useState(false)

    const formatTimeRemaining = (endDate: string) => {
        const end = new Date(endDate)
        const now = new Date()
        const diff = end.getTime() - now.getTime()

        if (diff <= 0) {
            return 'Ended'
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24))
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

        if (days > 0) {
            return `Ends in ${days}d ${hours}h`
        }
        if (hours > 0) {
            return `Ends in ${hours}h ${minutes}m`
        }
        return `Ends in ${minutes}m`
    }

    const formatStartTimeRemaining = (startDate: string) => {
        const start = new Date(startDate)
        const now = new Date()
        const diff = start.getTime() - now.getTime()

        if (diff <= 0) {
            return null // Already started
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24))
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

        if (days > 0) {
            return `Starts in ${days}d ${hours}h`
        }
        if (hours > 0) {
            return `Starts in ${hours}h ${minutes}m`
        }
        return `Starts in ${minutes}m`
    }

    const startsInText = formatStartTimeRemaining(raffle.start_at)
    const isScheduledForFuture = startsInText !== null

    const getTypeBadge = (type: string) => {
        const badges: Record<string, string> = {
            daily: 'Daily',
            weekly: 'Weekly',
            sub_only: 'Sub only',
            special: 'Special',
            general: 'General',
        }
        return badges[type] || type
    }

    const canPurchase = raffle.status === 'active' && (!raffle.sub_only || isSubscriber)
    const isSoldOut = raffle.total_tickets_cap != null && raffle.total_tickets_sold >= raffle.total_tickets_cap

    return (
        <>
            <div className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6 shadow-sm hover:shadow-md transition-shadow">
                {/* Scheduled banner - shown when raffle hasn't started yet */}
                {isScheduledForFuture && (
                    <div className="mb-4 -mt-2 -mx-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 rounded-t-lg">
                        <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
                                {startsInText}
                            </span>
                        </div>
                    </div>
                )}

                <div className="flex items-start justify-between mb-4">
                    <h3 className="text-h4 font-semibold text-gray-900 dark:text-kick-text">
                        {raffle.title}
                    </h3>
                    <div className="flex gap-2">
                        <span className="px-2 py-1 text-xs font-medium rounded bg-kick-purple/20 text-kick-purple">
                            {getTypeBadge(raffle.type)}
                        </span>
                        {raffle.sub_only && (
                            <span className="px-2 py-1 text-xs font-medium rounded bg-yellow-500/20 text-yellow-600 dark:text-yellow-400">
                                Sub Only
                            </span>
                        )}
                    </div>
                </div>

                <div className="space-y-3 mb-4">
                    <div>
                        <p className="text-small font-medium text-gray-600 dark:text-kick-text-secondary mb-1">
                            Prize
                        </p>
                        <p className="text-body text-gray-900 dark:text-kick-text">
                            {raffle.prize_description}
                        </p>
                    </div>

                    <div>
                        <p className="text-small font-medium text-gray-600 dark:text-kick-text-secondary mb-1">
                            Cost per ticket
                        </p>
                        <p className="text-body text-gray-900 dark:text-kick-text">
                            {raffle.ticket_cost} points
                        </p>
                    </div>

                    <div>
                        <p className="text-small font-medium text-gray-600 dark:text-kick-text-secondary mb-1">
                            Tickets
                        </p>
                        <p className="text-body text-gray-900 dark:text-kick-text">
                            {raffle.total_tickets_cap
                                ? `${raffle.total_tickets_sold.toLocaleString()} / ${raffle.total_tickets_cap.toLocaleString()} tickets sold`
                                : 'No ticket limit'}
                        </p>
                    </div>

                    <div>
                        <p className="text-small font-medium text-gray-600 dark:text-kick-text-secondary mb-1">
                            Your tickets
                        </p>
                        <p className="text-body text-gray-900 dark:text-kick-text">
                            {raffle.user_tickets > 0 ? `You own ${raffle.user_tickets} tickets` : 'You have no tickets yet'}
                        </p>
                    </div>

                    <div>
                        <p className="text-small font-medium text-gray-600 dark:text-kick-text-secondary mb-1">
                            Time remaining
                        </p>
                        <p className="text-body text-gray-900 dark:text-kick-text">
                            {isScheduledForFuture ? (
                                <span className="text-amber-600 dark:text-amber-400">Not started yet</span>
                            ) : (
                                formatTimeRemaining(raffle.end_at)
                            )}
                        </p>
                    </div>
                </div>

                {raffle.sub_only && !isSubscriber && (
                    <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                        <p className="text-small text-yellow-800 dark:text-yellow-200">
                            Sub only raffle
                        </p>
                        <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                            Available only for Kick subscribers.
                        </p>
                    </div>
                )}

                <div className="flex gap-2">
                    <button
                        onClick={() => setShowBuyModal(true)}
                        disabled={!canPurchase || isSoldOut || isScheduledForFuture}
                        className="flex-1 px-4 py-2 bg-kick-purple text-white rounded-lg hover:bg-kick-purple-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {isScheduledForFuture ? 'Coming Soon' : isSoldOut ? 'Sold Out' : 'Buy tickets'}
                    </button>
                    <button
                        onClick={() => setShowDetailsModal(true)}
                        className="px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg text-gray-700 dark:text-kick-text hover:bg-gray-50 dark:hover:bg-kick-surface-hover transition-colors"
                    >
                        Details
                    </button>
                </div>
            </div>

            <BuyTicketsModal
                isOpen={showBuyModal}
                onClose={() => setShowBuyModal(false)}
                raffle={raffle}
                userBalance={userBalance}
                onPurchase={async (quantity) => {
                    await onPurchase(raffle.id, quantity)
                }}
            />

            <RaffleDetailsModal
                isOpen={showDetailsModal}
                onClose={() => setShowDetailsModal(false)}
                raffle={raffle}
            />
        </>
    )
}
