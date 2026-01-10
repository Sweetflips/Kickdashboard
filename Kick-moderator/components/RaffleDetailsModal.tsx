'use client'

interface RaffleDetailsModalProps {
    isOpen: boolean
    onClose: () => void
    raffle: {
        id: string
        title: string
        description?: string
        type: string
        prize_description: string
        ticket_cost: number
        max_tickets_per_user?: number | null
        total_tickets_cap?: number | null
        start_at: string
        end_at: string
    } | null
}

export default function RaffleDetailsModal({ isOpen, onClose, raffle }: RaffleDetailsModalProps) {
    if (!isOpen || !raffle) return null

    const formatDate = (dateString: string) => {
        const date = new Date(dateString)
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short',
        })
    }

    const getTypeLabel = (type: string) => {
        const labels: Record<string, string> = {
            daily: 'Daily raffle',
            weekly: 'Weekly raffle',
            special: 'Special raffle',
            sub_only: 'Sub only raffle',
            general: 'General raffle',
        }
        return labels[type] || type
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
            <div
                className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-h3 font-semibold text-gray-900 dark:text-kick-text">
                        {raffle.title}
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
                        <h3 className="text-small font-semibold text-gray-600 dark:text-kick-text-secondary mb-1">
                            Prize
                        </h3>
                        <p className="text-body text-gray-900 dark:text-kick-text">
                            {raffle.prize_description}
                        </p>
                    </div>

                    <div>
                        <h3 className="text-small font-semibold text-gray-600 dark:text-kick-text-secondary mb-1">
                            Raffle type
                        </h3>
                        <p className="text-body text-gray-900 dark:text-kick-text">
                            {getTypeLabel(raffle.type)}
                        </p>
                    </div>

                    <div>
                        <h3 className="text-small font-semibold text-gray-600 dark:text-kick-text-secondary mb-1">
                            Cost per ticket
                        </h3>
                        <p className="text-body text-gray-900 dark:text-kick-text">
                            {raffle.ticket_cost} points
                        </p>
                    </div>

                    <div>
                        <h3 className="text-small font-semibold text-gray-600 dark:text-kick-text-secondary mb-1">
                            Max tickets per user
                        </h3>
                        <p className="text-body text-gray-900 dark:text-kick-text">
                            {raffle.max_tickets_per_user ? `Up to ${raffle.max_tickets_per_user} tickets per user` : 'No limit per user'}
                        </p>
                    </div>

                    <div>
                        <h3 className="text-small font-semibold text-gray-600 dark:text-kick-text-secondary mb-1">
                            Raffle period
                        </h3>
                        <p className="text-body text-gray-900 dark:text-kick-text">
                            Starts: {formatDate(raffle.start_at)}
                        </p>
                        <p className="text-body text-gray-900 dark:text-kick-text">
                            Ends: {formatDate(raffle.end_at)}
                        </p>
                    </div>

                    {raffle.description && (
                        <div>
                            <h3 className="text-small font-semibold text-gray-600 dark:text-kick-text-secondary mb-1">
                                Description
                            </h3>
                            <p className="text-body text-gray-900 dark:text-kick-text whitespace-pre-wrap">
                                {raffle.description}
                            </p>
                        </div>
                    )}

                    <div>
                        <h3 className="text-small font-semibold text-gray-600 dark:text-kick-text-secondary mb-1">
                            How winners are chosen
                        </h3>
                        <p className="text-body text-gray-700 dark:text-kick-text-secondary">
                            Winners are selected randomly from all purchased tickets when the raffle ends. Each ticket has an equal chance to win.
                        </p>
                    </div>

                    <div className="pt-4 border-t border-gray-200 dark:border-kick-border">
                        <p className="text-small text-gray-600 dark:text-kick-text-muted">
                            If you win, you will receive a tip on Kick or instructions via Telegram. You can also see your results on the "Raffle history" tab.
                        </p>
                    </div>
                </div>

                <div className="mt-6">
                    <button
                        onClick={onClose}
                        className="w-full px-4 py-2 bg-gray-200 dark:bg-kick-surface-hover text-gray-700 dark:text-kick-text rounded-lg hover:bg-gray-300 dark:hover:bg-kick-dark transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    )
}
