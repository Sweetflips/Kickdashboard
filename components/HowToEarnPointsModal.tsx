'use client'

interface HowToEarnPointsModalProps {
    isOpen: boolean
    onClose: () => void
}

export default function HowToEarnPointsModal({ isOpen, onClose }: HowToEarnPointsModalProps) {
    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
            <div
                className="bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-6 max-w-md w-full mx-4"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-h3 font-semibold text-gray-900 dark:text-kick-text">
                        How to earn points
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
                    <p className="text-body text-gray-700 dark:text-kick-text-secondary">
                        You earn points by hanging out and chatting during SweetFlips streams.
                    </p>

                    <ul className="space-y-2 text-body text-gray-700 dark:text-kick-text-secondary">
                        <li className="flex items-start">
                            <span className="mr-2">•</span>
                            <span>1 point every 5 minutes while you are active in chat</span>
                        </li>
                        <li className="flex items-start">
                            <span className="mr-2">•</span>
                            <span>2 points every 5 minutes if you are a Kick subscriber</span>
                        </li>
                    </ul>

                    <p className="text-small text-gray-600 dark:text-kick-text-muted">
                        Extra points may be given during special events or quests. Keep an eye on stream announcements.
                    </p>
                </div>

                <div className="mt-6">
                    <button
                        onClick={onClose}
                        className="w-full px-4 py-2 bg-kick-purple text-white rounded-lg hover:bg-kick-purple-dark transition-colors"
                    >
                        Got it
                    </button>
                </div>
            </div>
        </div>
    )
}
