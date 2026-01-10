'use client'

import Image from 'next/image'
import { useState } from 'react'
import HowToEarnSweetCoinsModal from '@/components/HowToEarnSweetCoinsModal'

interface SweetCoinsBarProps {
    points: number
    className?: string
    showLearnButton?: boolean
}

export default function SweetCoinsBar({ points, className, showLearnButton = true }: SweetCoinsBarProps) {
    const [isHowToOpen, setIsHowToOpen] = useState(false)

    return (
        <>
            <div
                className={`bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border p-4 sm:p-6 ${className ?? ''}`}
            >
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-kick-surface-hover flex items-center justify-center border border-gray-200 dark:border-kick-border">
                            <Image
                                src="/icons/Sweetflipscoin.png"
                                alt=""
                                width={22}
                                height={22}
                                className="w-[22px] h-[22px]"
                            />
                        </div>
                        <div>
                            <p className="text-small font-medium text-gray-600 dark:text-kick-text-secondary">
                                Your Sweet Coins
                            </p>
                            <p className="text-h3 font-semibold text-gray-900 dark:text-kick-text tabular-nums">
                                {Number.isFinite(points) ? points.toLocaleString() : '0'}
                            </p>
                        </div>
                    </div>

                    {showLearnButton && (
                        <button
                            type="button"
                            onClick={() => setIsHowToOpen(true)}
                            className="px-4 py-2 text-small font-medium text-kick-purple hover:text-kick-purple-dark transition-colors whitespace-nowrap"
                        >
                            Learn how to earn Sweet Coins
                        </button>
                    )}
                </div>
            </div>

            <HowToEarnSweetCoinsModal isOpen={isHowToOpen} onClose={() => setIsHowToOpen(false)} />
        </>
    )
}
