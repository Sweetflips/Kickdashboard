'use client'

interface WinnerClaimModalProps {
    isOpen: boolean
    onClose: () => void
    raffle: {
        title: string
        prize_description: string
        claim_message?: string | null
        drawn_at?: string | null
    } | null
}

export default function WinnerClaimModal({ isOpen, onClose, raffle }: WinnerClaimModalProps) {
    if (!isOpen || !raffle) return null

    const defaultClaimMessage = "Contact @danielsweetflips on Telegram to claim your prize."

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
            <div
                className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <span className="text-3xl">🎉</span>
                        <h2 className="text-h3 font-semibold text-gray-900 dark:text-kick-text">
                            Congratulations!
                        </h2>
                    </div>
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
                    <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                        <p className="text-green-800 dark:text-green-200 font-medium">
                            You won the "{raffle.title}" raffle!
                        </p>
                    </div>

                    <div>
                        <h3 className="text-small font-semibold text-gray-600 dark:text-kick-text-secondary mb-1">
                            Your Prize
                        </h3>
                        <p className="text-body text-gray-900 dark:text-kick-text">
                            {raffle.prize_description}
                        </p>
                    </div>

                    <div>
                        <h3 className="text-small font-semibold text-gray-600 dark:text-kick-text-secondary mb-1">
                            How to Claim
                        </h3>
                        <div className="p-4 bg-kick-purple/10 dark:bg-kick-purple/20 border border-kick-purple/30 rounded-lg">
                            <p className="text-body text-gray-900 dark:text-kick-text whitespace-pre-wrap">
                                {raffle.claim_message || defaultClaimMessage}
                            </p>
                        </div>
                    </div>

                    {raffle.drawn_at && (
                        <div>
                            <h3 className="text-small font-semibold text-gray-600 dark:text-kick-text-secondary mb-1">
                                Drawn On
                            </h3>
                            <p className="text-body text-gray-900 dark:text-kick-text">
                                {new Date(raffle.drawn_at).toLocaleString('en-US', {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    timeZoneName: 'short',
                                })}
                            </p>
                        </div>
                    )}

                    <div className="pt-4 border-t border-gray-200 dark:border-kick-border">
                        <p className="text-small text-gray-600 dark:text-kick-text-muted">
                            Make sure to claim your prize within 30 days. If you have any questions, reach out via the contact method above.
                        </p>
                    </div>
                </div>

                <div className="mt-6">
                    <button
                        onClick={onClose}
                        className="w-full px-4 py-2 bg-kick-purple text-white rounded-lg hover:bg-kick-purple-dark transition-colors"
                    >
                        Got it!
                    </button>
                </div>
            </div>
        </div>
    )
}
