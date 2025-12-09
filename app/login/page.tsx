'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'

// Note: Since this is a client component, metadata must be set via head tags
// The page title will be handled by the parent layout

function LoginContent() {
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [referralCode, setReferralCode] = useState<string | null>(null)

    useEffect(() => {
        // Check if already authenticated
        if (typeof window !== 'undefined') {
            const token = localStorage.getItem('kick_access_token')
            const params = new URLSearchParams(window.location.search)

            // Get referral code from URL
            const ref = params.get('ref')
            if (ref) {
                setReferralCode(ref)
            }

            // Handle auth callback
            if (params.get('auth_success') === 'true') {
                const accessToken = params.get('access_token')
                const refreshToken = params.get('refresh_token')

                if (accessToken) {
                    // Validate token is not empty (Kick uses opaque tokens, not JWTs)
                    if (accessToken.trim().length > 0) {
                        localStorage.setItem('kick_access_token', accessToken)
                        if (refreshToken) {
                            localStorage.setItem('kick_refresh_token', refreshToken)
                        }
                        // Clean URL and redirect
                        router.push('/')
                        return
                    } else {
                        console.error('❌ [LOGIN] Empty token received')
                        setError('Invalid token received. Please try logging in again.')
                    }
                }
            }

            // Handle errors
            if (params.get('error')) {
                const errorParam = params.get('error')
                if (errorParam === 'invalid_token') {
                    // Clear any corrupted tokens
                    localStorage.removeItem('kick_access_token')
                    localStorage.removeItem('kick_refresh_token')
                    setError('Your session token is invalid. Please sign in again.')
                } else {
                    setError(errorParam || 'Authentication failed')
                }
            }

            // If already has token, validate it before redirecting
            if (token) {
                // Kick uses opaque tokens, just check it's not empty
                if (token.trim().length > 0) {
                    // Token is valid, redirect
                    if (!params.get('error')) {
                        router.push('/')
                    }
                } else {
                    // Empty token, clear it
                    console.error('❌ [LOGIN] Empty token in localStorage')
                    localStorage.removeItem('kick_access_token')
                    localStorage.removeItem('kick_refresh_token')
                    setError('Your session token is invalid. Please sign in again.')
                }
            }
        }
    }, [router])

    const handleKickLogin = () => {
        setIsLoading(true)
        setError(null)
        // Pass referral code to auth endpoint if provided
        const authUrl = referralCode 
            ? `/api/auth?action=authorize&ref=${encodeURIComponent(referralCode)}`
            : '/api/auth?action=authorize'
        window.location.href = authUrl
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-kick-dark dark:via-kick-surface dark:to-kick-dark relative overflow-hidden">
            {/* Subtle background pattern */}
            <div className="absolute inset-0 opacity-[0.02] dark:opacity-[0.05]">
                <div className="absolute inset-0" style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                }}></div>
            </div>

            {/* Login Card */}
            <div className="relative z-10 w-full max-w-md px-6">
                <div className="bg-white dark:bg-kick-surface rounded-3xl shadow-xl border border-gray-200 dark:border-kick-border p-10">
                    {/* SweetFlips Logo */}
                    <div className="text-center mb-10">
                        <div className="inline-flex items-center justify-center mb-6">
                            <div className="shadow-lg overflow-hidden">
                                <Image
                                    src="/8 EMERALD (1).png"
                                    alt="SweetFlips Logo"
                                    width={160}
                                    height={160}
                                    className="w-40 h-40 object-contain"
                                    unoptimized
                                />
                            </div>
                        </div>
                        <h1 className="text-3xl font-bold bg-gradient-to-r from-kick-green to-kick-green-dark bg-clip-text text-transparent mb-2">
                            SweetFlips
                        </h1>
                        <p className="text-sm text-gray-600 dark:text-kick-text-secondary font-medium">
                            Rewards & Analytics
                        </p>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                            <div className="flex items-center gap-2">
                                <svg className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                </svg>
                                <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                            </div>
                        </div>
                    )}

                    {/* Welcome Text */}
                    <div className="mb-8 text-center">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-2">
                            Welcome Back
                        </h2>
                        <p className="text-sm text-gray-600 dark:text-kick-text-secondary">
                            Sign in with your Kick account to get started
                        </p>
                    </div>

                    {/* Kick OAuth Button */}
                    <button
                        onClick={handleKickLogin}
                        disabled={isLoading}
                        className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-kick-green to-kick-green-dark hover:from-kick-green-dark hover:to-kick-green-dark/90 text-white font-semibold text-base rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-[0.98]"
                    >
                        {isLoading ? (
                            <>
                                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span>Connecting...</span>
                            </>
                        ) : (
                            <>
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                                </svg>
                                <span>Continue with Kick</span>
                            </>
                        )}
                    </button>

                    {/* Security Note */}
                    <div className="mt-8 pt-6 border-t border-gray-200 dark:border-kick-border">
                        <div className="flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-kick-text-secondary">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                            </svg>
                            <span>Secure OAuth 2.0 authentication</span>
                        </div>
                    </div>
                </div>

                {/* Legal Links */}
                <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-gray-500 dark:text-kick-text-secondary">
                    <Link href="/legal/terms" className="hover:text-gray-700 dark:hover:text-kick-text transition-colors">
                        Terms of Service
                    </Link>
                    <span className="text-gray-300 dark:text-kick-border">•</span>
                    <Link href="/legal/privacy" className="hover:text-gray-700 dark:hover:text-kick-text transition-colors">
                        Privacy Policy
                    </Link>
                    <span className="text-gray-300 dark:text-kick-border">•</span>
                    <Link href="/legal/cookies" className="hover:text-gray-700 dark:hover:text-kick-text transition-colors">
                        Cookies
                    </Link>
                </div>
            </div>
        </div>
    )
}

export default function LoginPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <LoginContent />
        </Suspense>
    )
}
