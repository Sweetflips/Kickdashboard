'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Image from 'next/image'

interface ConnectedAccount {
    provider: 'kick' | 'discord' | 'telegram'
    connected: boolean
    username?: string
    userId?: string
}

interface ConnectAccountsNudgeProps {
    kickUserId: number
}

export default function ConnectAccountsNudge({ kickUserId }: ConnectAccountsNudgeProps) {
    const router = useRouter()
    const pathname = usePathname()
    const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([])
    const [loading, setLoading] = useState(true)
    const [dismissed, setDismissed] = useState(false)

    useEffect(() => {
        // Don't show on profile page
        if (pathname === '/profile') {
            setLoading(false)
            return
        }

        // Check if dismissed (24h check)
        if (typeof window !== 'undefined') {
            const dismissedUntil = localStorage.getItem('connect_accounts_nudge_dismissed_until')
            if (dismissedUntil) {
                const until = parseInt(dismissedUntil, 10)
                if (Date.now() < until) {
                    setDismissed(true)
                    setLoading(false)
                    return
                } else {
                    // Expired, remove it
                    localStorage.removeItem('connect_accounts_nudge_dismissed_until')
                }
            }
        }

        fetchConnectedAccounts()
    }, [kickUserId, pathname])

    const fetchConnectedAccounts = async () => {
        try {
            const response = await fetch(`/api/connected-accounts?kick_user_id=${kickUserId}`)
            if (response.ok) {
                const data = await response.json()
                setConnectedAccounts(data.accounts || [])
            }
        } catch (error) {
            console.error('Failed to fetch connected accounts:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleConnectDiscord = async () => {
        try {
            const response = await fetch(`/api/oauth/discord/connect`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kick_user_id: kickUserId }),
            })

            if (response.ok) {
                const data = await response.json()
                if (data.authUrl) {
                    window.location.href = data.authUrl
                }
            }
        } catch (error) {
            console.error('Failed to connect Discord:', error)
        }
    }

    const handleConnectTelegram = () => {
        router.push('/profile?tab=connected&connect=telegram')
    }

    const handleDismiss = () => {
        // Hide for 24 hours
        const dismissedUntil = Date.now() + 24 * 60 * 60 * 1000
        localStorage.setItem('connect_accounts_nudge_dismissed_until', dismissedUntil.toString())
        setDismissed(true)
    }

    if (loading || dismissed) {
        return null
    }

    const discord = connectedAccounts.find(acc => acc.provider === 'discord')
    const telegram = connectedAccounts.find(acc => acc.provider === 'telegram')

    const discordMissing = !discord?.connected
    const telegramMissing = !telegram?.connected

    // Don't show if both are connected
    if (!discordMissing && !telegramMissing) {
        return null
    }

    // Don't show on profile page
    if (pathname === '/profile') {
        return null
    }

    const missingCount = (discordMissing ? 1 : 0) + (telegramMissing ? 1 : 0)
    const isBothMissing = discordMissing && telegramMissing

    return (
        <div className="fixed bottom-4 right-4 z-50 w-full max-w-md lg:max-w-sm">
            <div className="bg-white dark:bg-kick-surface border border-gray-200 dark:border-kick-border rounded-xl shadow-lg p-4 md:p-5 mx-4 lg:mx-0">
                <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-kick-text mb-1">
                            Connect accounts to earn Sweet Coins
                        </h3>
                        <p className="text-xs text-gray-600 dark:text-kick-text-secondary">
                            {isBothMissing ? (
                                <>Connect Discord (+25) and Telegram (+25) to unlock achievements.</>
                            ) : discordMissing ? (
                                <>Connect Discord (+25) to unlock an achievement.</>
                            ) : (
                                <>Connect Telegram (+25) to unlock an achievement.</>
                            )}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-kick-text-muted mt-1">
                            After connecting, claim the achievement to add Sweet Coins.
                        </p>
                    </div>
                    <button
                        onClick={handleDismiss}
                        className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-kick-text-secondary transition-colors"
                        aria-label="Dismiss"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="flex flex-col gap-2">
                    {discordMissing && (
                        <button
                            onClick={handleConnectDiscord}
                            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors text-sm font-medium"
                        >
                            <Image
                                src="/icons/discord.png"
                                alt="Discord"
                                width={20}
                                height={20}
                                className="w-5 h-5"
                            />
                            Connect Discord (+25)
                        </button>
                    )}
                    {telegramMissing && (
                        <button
                            onClick={handleConnectTelegram}
                            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors text-sm font-medium"
                        >
                            <Image
                                src="/logos/telegram-logo.png"
                                alt="Telegram"
                                width={20}
                                height={20}
                                className="w-5 h-5"
                            />
                            Connect Telegram (+25)
                        </button>
                    )}
                    <button
                        onClick={handleDismiss}
                        className="text-xs text-gray-500 dark:text-kick-text-secondary hover:text-gray-700 dark:hover:text-kick-text transition-colors py-1"
                    >
                        Not now
                    </button>
                </div>
            </div>
        </div>
    )
}
