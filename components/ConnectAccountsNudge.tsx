'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Image from 'next/image'

interface ConnectedAccount {
    provider: 'kick' | 'discord' | 'telegram' | 'twitter' | 'instagram'
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

    const handleConnectTwitter = async () => {
        try {
            const response = await fetch(`/api/oauth/twitter/connect`, {
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
            console.error('Failed to connect Twitter:', error)
        }
    }

    const handleConnectInstagram = async () => {
        try {
            const response = await fetch(`/api/oauth/instagram/connect`, {
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
            console.error('Failed to connect Instagram:', error)
        }
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
    const twitter = connectedAccounts.find(acc => acc.provider === 'twitter')
    const instagram = connectedAccounts.find(acc => acc.provider === 'instagram')

    const discordMissing = !discord?.connected
    const telegramMissing = !telegram?.connected
    const twitterMissing = !twitter?.connected
    const instagramMissing = !instagram?.connected

    // Don't show if all are connected
    if (!discordMissing && !telegramMissing && !twitterMissing && !instagramMissing) {
        return null
    }

    // Don't show on profile page
    if (pathname === '/profile') {
        return null
    }

    const missingCount = (discordMissing ? 1 : 0) + (telegramMissing ? 1 : 0) + (twitterMissing ? 1 : 0) + (instagramMissing ? 1 : 0)
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
                            {missingCount > 2 ? (
                                <>Connect accounts to unlock achievements: Discord (+25), Telegram (+25), Twitter (+100), Instagram (+100).</>
                            ) : isBothMissing ? (
                                <>Connect Discord (+25) and Telegram (+25) to unlock achievements.</>
                            ) : discordMissing ? (
                                <>Connect Discord (+25) to unlock an achievement.</>
                            ) : telegramMissing ? (
                                <>Connect Telegram (+25) to unlock an achievement.</>
                            ) : twitterMissing ? (
                                <>Connect Twitter (+100) to unlock an achievement.</>
                            ) : (
                                <>Connect Instagram (+100) to unlock an achievement.</>
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
                    {twitterMissing && (
                        <button
                            onClick={handleConnectTwitter}
                            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-black hover:bg-gray-800 text-white rounded-lg transition-colors text-sm font-medium"
                        >
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                            </svg>
                            Connect Twitter (+100)
                        </button>
                    )}
                    {instagramMissing && (
                        <button
                            onClick={handleConnectInstagram}
                            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400 hover:from-purple-700 hover:via-pink-600 hover:to-orange-500 text-white rounded-lg transition-colors text-sm font-medium"
                        >
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                            </svg>
                            Connect Instagram (+100)
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
