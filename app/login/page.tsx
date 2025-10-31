'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        // Check if already authenticated
        if (typeof window !== 'undefined') {
            const token = localStorage.getItem('kick_access_token')
            const params = new URLSearchParams(window.location.search)

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
        window.location.href = '/api/auth?action=authorize'
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-kick-dark via-kick-surface to-kick-dark relative overflow-hidden">
            {/* Background Pattern */}
            <div className="absolute inset-0 opacity-5 dark:opacity-10">
                <div className="absolute inset-0" style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                }}></div>
            </div>

            {/* Login Card */}
            <div className="relative z-10 w-full max-w-md px-6">
                <div className="bg-kick-surface rounded-2xl shadow-2xl border border-kick-border p-8 md:p-10">
                    {/* Logo/Brand */}
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-kick-green to-kick-green-dark rounded-2xl mb-4 shadow-lg">
                            <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                            </svg>
                        </div>
                        <h1 className="text-h1 font-semibold text-kick-text mb-2">
                            Welcome Back
                        </h1>
                        <p className="text-body text-kick-text-secondary">
                            Sign in to your Kick account to continue
                        </p>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                            <div className="flex items-center">
                                <svg className="w-5 h-5 text-red-600 dark:text-red-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                </svg>
                                <p className="text-small text-red-800 dark:text-red-200">{error}</p>
                            </div>
                        </div>
                    )}

                    {/* Kick OAuth Button */}
                    <button
                        onClick={handleKickLogin}
                        disabled={isLoading}
                        className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-kick-green to-kick-green-dark hover:from-kick-green-dark hover:to-kick-green-dark/90 text-white font-semibold text-body rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-lg transform hover:scale-[1.02] active:scale-[0.98]"
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
                                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                                </svg>
                                <span>Continue with Kick</span>
                            </>
                        )}
                    </button>

                    {/* Divider */}
                    <div className="relative my-8">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-kick-border"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-4 bg-kick-surface text-kick-text-secondary">
                                Secure authentication
                            </span>
                        </div>
                    </div>

                    {/* Features */}
                    <div className="space-y-4 mt-8">
                        <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 mt-0.5">
                                <svg className="w-5 h-5 text-kick-green" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-small font-medium text-kick-text">Chat Management</p>
                                <p className="text-xs text-kick-text-secondary">Send messages and manage chat interactions</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 mt-0.5">
                                <svg className="w-5 h-5 text-kick-green" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-small font-medium text-kick-text">Real-time Updates</p>
                                <p className="text-xs text-kick-text-secondary">Receive live chat messages and notifications</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 mt-0.5">
                                <svg className="w-5 h-5 text-kick-green" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-small font-medium text-kick-text">Secure & Private</p>
                                <p className="text-xs text-kick-text-secondary">Your credentials are protected with OAuth 2.0</p>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="mt-8 pt-6 border-t border-kick-border text-center">
                        <p className="text-xs text-kick-text-secondary">
                            By continuing, you agree to Kick's{' '}
                            <a href="https://kick.com/terms" target="_blank" rel="noopener noreferrer" className="text-kick-green hover:underline">
                                Terms of Service
                            </a>
                            {' '}and{' '}
                            <a href="https://kick.com/privacy" target="_blank" rel="noopener noreferrer" className="text-kick-green hover:underline">
                                Privacy Policy
                            </a>
                        </p>
                    </div>
                </div>

                {/* Additional Info */}
                <div className="mt-6 text-center">
                    <p className="text-small text-kick-text-secondary">
                        Need help?{' '}
                        <a href="https://kick.com/support" target="_blank" rel="noopener noreferrer" className="text-kick-green hover:underline font-medium">
                            Contact Support
                        </a>
                    </p>
                </div>
            </div>
        </div>
    )
}
