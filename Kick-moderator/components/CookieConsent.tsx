'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { setCookie, getCookie } from '@/lib/cookies'

const COOKIE_CONSENT_NAME = 'cookie_consent'
const COOKIE_CONSENT_VALUE = 'accepted'
const COOKIE_EXPIRY_DAYS = 180 // ~6 months

export default function CookieConsent() {
    const [showBanner, setShowBanner] = useState(false)
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
        // Check if consent cookie exists
        const consent = getCookie(COOKIE_CONSENT_NAME)
        if (!consent) {
            setShowBanner(true)
        }
    }, [])

    const handleAccept = () => {
        // Set consent cookie with 180 day expiry
        setCookie(COOKIE_CONSENT_NAME, COOKIE_CONSENT_VALUE, {
            path: '/',
            sameSite: 'lax',
            secure: window.location.protocol === 'https:',
            maxAgeDays: COOKIE_EXPIRY_DAYS,
        })

        setShowBanner(false)
    }

    // Don't render until mounted to avoid hydration mismatch
    if (!mounted || !showBanner) {
        return null
    }

    return (
        <div className="fixed bottom-0 left-0 right-0 z-[9998] p-4 pointer-events-none">
            <div className="max-w-7xl mx-auto">
                <div className="bg-white dark:bg-kick-surface border border-gray-200 dark:border-kick-border rounded-2xl shadow-[0_24px_80px_rgba(0,0,0,0.45)] p-6 pointer-events-auto">
                    <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
                        <div className="flex-1">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-kick-text mb-2">
                                Cookie Consent
                            </h3>
                            <p className="text-sm text-gray-600 dark:text-kick-text-secondary">
                                We use cookies to enhance your browsing experience, analyze site traffic, and personalize content.
                                By clicking &quot;Accept All&quot;, you consent to our use of cookies.{' '}
                                <Link
                                    href="/legal/cookies"
                                    className="text-kick-purple hover:text-kick-purple-dark underline font-medium"
                                >
                                    Learn more
                                </Link>
                            </p>
                        </div>
                        <div className="flex-shrink-0">
                            <button
                                onClick={handleAccept}
                                className="px-6 py-2.5 bg-kick-purple text-white rounded-lg hover:bg-kick-purple-dark transition-colors font-medium text-sm whitespace-nowrap"
                            >
                                Accept All
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
