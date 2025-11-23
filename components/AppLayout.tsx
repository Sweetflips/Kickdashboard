'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import ProfileDropdown from './ProfileDropdown'
import ThemeToggle from './ThemeToggle'

interface UserData {
    id?: number
    username?: string
    email?: string
    profile_picture?: string
    is_admin?: boolean
    [key: string]: any
}

interface LayoutProps {
    children: React.ReactNode
}

export default function AppLayout({ children }: LayoutProps) {
    const router = useRouter()
    const pathname = usePathname()
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const [isAuthenticated, setIsAuthenticated] = useState(false)
    const [userData, setUserData] = useState<UserData | null>(null)

    useEffect(() => {
        // Check authentication
        if (typeof window !== 'undefined') {
            const token = localStorage.getItem('kick_access_token')
            const params = new URLSearchParams(window.location.search)

            // Handle auth callback
            if (params.get('auth_success') === 'true') {
                const accessToken = params.get('access_token')
                const refreshToken = params.get('refresh_token')

                // Debug token
                if (accessToken) {
                    console.log('🔑 [AUTH CALLBACK] Token received from URL')
                    console.log('🔑 [AUTH CALLBACK] Token length:', accessToken.length)
                    console.log('🔑 [AUTH CALLBACK] Token preview:', accessToken.substring(0, 50))

                    // Kick uses opaque tokens, not JWTs - just validate it's not empty
                    if (accessToken.trim().length > 0) {
                        localStorage.setItem('kick_access_token', accessToken)
                        if (refreshToken) {
                            localStorage.setItem('kick_refresh_token', refreshToken)
                        }
                        setIsAuthenticated(true)
                        // Clean URL
                        const newUrl = window.location.pathname
                        window.history.replaceState({}, '', newUrl)
                    } else {
                        console.error('❌ [AUTH CALLBACK] Empty token received')
                        router.push('/login?error=invalid_token')
                        return
                    }
                }
            } else if (token) {
                // Validate stored token is not empty
                if (token.trim().length > 0) {
                    setIsAuthenticated(true)
                } else {
                    console.error('❌ [AUTH] Empty token in localStorage - clearing')
                    localStorage.removeItem('kick_access_token')
                    localStorage.removeItem('kick_refresh_token')
                    router.push('/login?error=invalid_token')
                    return
                }
            } else {
                // Don't redirect to login if we're on profile page with success parameter (OAuth callback)
                // This allows Telegram/Discord connections to complete even if token expires
                const isOAuthCallback = params.get('success') === 'true' || params.get('error')
                if (!isOAuthCallback) {
                    // Redirect to login if not authenticated
                    router.push('/login')
                    return
                } else {
                    // For OAuth callbacks, check if we have a token, if not try to get one
                    // But don't block the redirect - let the profile page handle it
                    console.log('⚠️ [AUTH] OAuth callback detected but no token - user may need to login with Kick first')
                }
            }
        }
    }, [router, pathname])

    useEffect(() => {
        if (!isAuthenticated) return
        fetchUserData()
    }, [isAuthenticated])

    // Refresh user data when URL has success parameter (after OAuth callbacks)
    useEffect(() => {
        if (typeof window === 'undefined' || !isAuthenticated) return

        const params = new URLSearchParams(window.location.search)
        const success = params.get('success')

        if (success === 'true') {
            // Refresh user data after successful OAuth connection
            setTimeout(() => {
                fetchUserData()
            }, 1000) // Delay to ensure DB has updated
        }
    }, [isAuthenticated, pathname])

    // Close sidebar on mobile when navigating
    useEffect(() => {
        if (typeof window === 'undefined') return
        const handleResize = () => {
            if (window.innerWidth >= 1024) {
                setSidebarOpen(false)
            }
        }
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    // Close sidebar when pathname changes on mobile
    useEffect(() => {
        if (typeof window !== 'undefined' && window.innerWidth < 1024) {
            setSidebarOpen(false)
        }
    }, [pathname])

    const fetchUserData = async () => {
        try {
            const token = localStorage.getItem('kick_access_token')
            if (!token) {
                return
            }

            // Validate token format before using
            if (!token || token.trim().length === 0) {
                console.error('❌ [FETCH USER] Empty token - clearing')
                localStorage.removeItem('kick_access_token')
                localStorage.removeItem('kick_refresh_token')
                router.push('/login?error=invalid_token')
                return
            }

            const response = await fetch(`/api/user?access_token=${encodeURIComponent(token)}`)

            if (response.ok) {
                const data = await response.json()
                setUserData(data)
            } else if (response.status === 401) {
                // Token expired, try to refresh
                const refreshToken = localStorage.getItem('kick_refresh_token')
                if (refreshToken) {
                    try {
                        const refreshResponse = await fetch('/api/auth/refresh', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                refresh_token: refreshToken,
                                kick_user_id: userData?.id,
                            }),
                        })
                        if (refreshResponse.ok) {
                            const refreshData = await refreshResponse.json()
                            localStorage.setItem('kick_access_token', refreshData.access_token)
                            if (refreshData.refresh_token) {
                                localStorage.setItem('kick_refresh_token', refreshData.refresh_token)
                            }
                            // Retry user fetch
                            const retryResponse = await fetch(`/api/user?access_token=${encodeURIComponent(refreshData.access_token)}`)
                            if (retryResponse.ok) {
                                const retryData = await retryResponse.json()
                                setUserData(retryData)
                            } else {
                                // Retry failed, clear tokens and redirect to login
                                console.error('❌ Failed to fetch user after token refresh')
                                localStorage.removeItem('kick_access_token')
                                localStorage.removeItem('kick_refresh_token')
                                router.push('/login?error=token_refresh_failed')
                            }
                        } else {
                            // Refresh failed, clear tokens and redirect to login
                            console.error('❌ Token refresh failed:', refreshResponse.status)
                            localStorage.removeItem('kick_access_token')
                            localStorage.removeItem('kick_refresh_token')
                            router.push('/login?error=token_expired')
                        }
                    } catch (refreshError) {
                        console.error('❌ Failed to refresh token:', refreshError)
                        // Clear tokens and redirect to login on error
                        localStorage.removeItem('kick_access_token')
                        localStorage.removeItem('kick_refresh_token')
                        router.push('/login?error=token_refresh_error')
                    }
                } else {
                    // No refresh token available, clear tokens and redirect to login
                    console.error('❌ No refresh token available')
                    localStorage.removeItem('kick_access_token')
                    localStorage.removeItem('kick_refresh_token')
                    router.push('/login?error=token_expired')
                }
            } else {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
                console.error('❌ Failed to fetch user data:', response.status, errorData)
            }
        } catch (err) {
            console.error('Error fetching user data:', err)
        }
    }

    if (!isAuthenticated) {
        return (
            <div className="flex items-center justify-center h-screen bg-white dark:bg-kick-dark">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kick-purple"></div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-white dark:bg-kick-dark">
            {/* Sidebar */}
            <aside className={`fixed top-0 left-0 z-40 w-64 h-screen transition-transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 bg-white dark:bg-kick-surface border-r border-gray-200 dark:border-kick-border`}>
                <div className="h-full px-3 py-4 overflow-y-auto">
                    <div className="flex items-center justify-between mb-8 px-2">
                        <div className="flex items-center gap-3">
                            <Link href="/" className="flex items-center">
                                <Image
                                    src="/kick.jpg"
                                    alt="Kick Logo"
                                    width={32}
                                    height={32}
                                    className="rounded-lg"
                                />
                            </Link>
                            <h2 className="text-h4 font-semibold text-gray-900 dark:text-kick-text">Dashboard</h2>
                        </div>
                        <button
                            onClick={() => setSidebarOpen(false)}
                            className="lg:hidden text-gray-600 dark:text-kick-text-secondary hover:text-gray-900 dark:hover:text-kick-text"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    <ul className="space-y-2">
                        <li>
                            <Link href="/" className={`flex items-center p-2 rounded-lg transition-colors ${pathname === '/' ? 'bg-gray-100 dark:bg-kick-surface-hover text-gray-900 dark:text-kick-text' : 'text-gray-600 dark:text-kick-text-secondary hover:bg-gray-100 dark:hover:bg-kick-surface-hover hover:text-gray-900 dark:hover:text-kick-text'}`} onClick={() => {
                                if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                                    setSidebarOpen(false)
                                }
                            }}>
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                                </svg>
                                <span className="ml-3 text-body font-medium">Dashboard</span>
                            </Link>
                        </li>
                        <li>
                            <Link href="/leaderboard" className={`flex items-center p-2 rounded-lg transition-colors ${pathname === '/leaderboard' ? 'bg-gray-100 dark:bg-kick-surface-hover text-gray-900 dark:text-kick-text' : 'text-gray-600 dark:text-kick-text-secondary hover:bg-gray-100 dark:hover:bg-kick-surface-hover hover:text-gray-900 dark:hover:text-kick-text'}`} onClick={() => {
                                if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                                    setSidebarOpen(false)
                                }
                            }}>
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                                    <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                                </svg>
                                <span className="ml-3 text-body font-medium">Leaderboard</span>
                            </Link>
                        </li>
                        {userData?.is_admin && (
                            <li>
                                <Link href="/streams" className={`flex items-center p-2 rounded-lg transition-colors ${pathname === '/streams' || pathname?.startsWith('/streams/') ? 'bg-gray-100 dark:bg-kick-surface-hover text-gray-900 dark:text-kick-text' : 'text-gray-600 dark:text-kick-text-secondary hover:bg-gray-100 dark:hover:bg-kick-surface-hover hover:text-gray-900 dark:hover:text-kick-text'}`} onClick={() => {
                                    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                                        setSidebarOpen(false)
                                    }
                                }}>
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                        <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                                    </svg>
                                    <span className="ml-3 text-body font-medium">Past Streams</span>
                                </Link>
                            </li>
                        )}
                        {userData?.is_admin && (
                            <>
                                <li className="mt-4 mb-2">
                                    <div className="px-2 py-1 text-xs font-semibold text-gray-500 dark:text-kick-text-secondary uppercase tracking-wider">
                                        Admin
                                    </div>
                                </li>
                                <li>
                                    <Link href="/admin/analytics" className={`flex items-center p-2 rounded-lg transition-colors ${pathname === '/admin/analytics' || pathname === '/analytics' ? 'bg-gray-100 dark:bg-kick-surface-hover text-gray-900 dark:text-kick-text' : 'text-gray-600 dark:text-kick-text-secondary hover:bg-gray-100 dark:hover:bg-kick-surface-hover hover:text-gray-900 dark:hover:text-kick-text'}`} onClick={() => {
                                        if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                                            setSidebarOpen(false)
                                        }
                                    }}>
                                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                            <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                                            <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                                        </svg>
                                        <span className="ml-3 text-body font-medium">Analytics</span>
                                    </Link>
                                </li>
                                <li>
                                    <Link href="/admin/giveaways" className={`flex items-center p-2 rounded-lg transition-colors ${pathname === '/admin/giveaways' || pathname === '/giveaways' ? 'bg-gray-100 dark:bg-kick-surface-hover text-gray-900 dark:text-kick-text' : 'text-gray-600 dark:text-kick-text-secondary hover:bg-gray-100 dark:hover:bg-kick-surface-hover hover:text-gray-900 dark:hover:text-kick-text'}`} onClick={() => {
                                        if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                                            setSidebarOpen(false)
                                        }
                                    }}>
                                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                            <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                                            <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm9.707 5.707a1 1 0 00-1.414-1.414L9 12.586l-1.293-1.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                        </svg>
                                        <span className="ml-3 text-body font-medium">Giveaways</span>
                                    </Link>
                                </li>
                                <li>
                                    <Link href="/admin/streams" className={`flex items-center p-2 rounded-lg transition-colors ${pathname === '/admin/streams' ? 'bg-gray-100 dark:bg-kick-surface-hover text-gray-900 dark:text-kick-text' : 'text-gray-600 dark:text-kick-text-secondary hover:bg-gray-100 dark:hover:bg-kick-surface-hover hover:text-gray-900 dark:hover:text-kick-text'}`} onClick={() => {
                                        if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                                            setSidebarOpen(false)
                                        }
                                    }}>
                                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                            <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                                        </svg>
                                        <span className="ml-3 text-body font-medium">Stream Management</span>
                                    </Link>
                                </li>
                                <li>
                                    <Link href="/admin/users" className={`flex items-center p-2 rounded-lg transition-colors ${pathname === '/admin/users' ? 'bg-gray-100 dark:bg-kick-surface-hover text-gray-900 dark:text-kick-text' : 'text-gray-600 dark:text-kick-text-secondary hover:bg-gray-100 dark:hover:bg-kick-surface-hover hover:text-gray-900 dark:hover:text-kick-text'}`} onClick={() => {
                                        if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                                            setSidebarOpen(false)
                                        }
                                    }}>
                                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                            <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                                        </svg>
                                        <span className="ml-3 text-body font-medium">User Management</span>
                                    </Link>
                                </li>
                            </>
                        )}
                        <li>
                            <Link href="/profile" className={`flex items-center p-2 rounded-lg transition-colors ${pathname === '/profile' || pathname === '/settings' ? 'bg-gray-100 dark:bg-kick-surface-hover text-gray-900 dark:text-kick-text' : 'text-gray-600 dark:text-kick-text-secondary hover:bg-gray-100 dark:hover:bg-kick-surface-hover hover:text-gray-900 dark:hover:text-kick-text'}`} onClick={() => {
                                if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                                    setSidebarOpen(false)
                                }
                            }}>
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-6-3a2 2 0 11-4 0 2 2 0 014 0zm-2 4a5 5 0 00-4.546 2.916A5.986 5.986 0 0010 16a5.986 5.986 0 004.546-2.084A5 5 0 0010 11z" clipRule="evenodd" />
                                </svg>
                                <span className="ml-3 text-body font-medium">Settings</span>
                            </Link>
                        </li>
                    </ul>
                </div>
            </aside>

            {/* Main Content */}
            <div className="lg:ml-64">
                {/* Top Navigation */}
                <nav className="bg-white dark:bg-kick-surface border-b border-gray-200 dark:border-kick-border px-4 py-3 shadow-sm">
                    <div className="flex items-center justify-between">
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="lg:hidden text-gray-600 dark:text-kick-text-secondary hover:text-gray-900 dark:hover:text-kick-text"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                        </button>
                        <div className="flex-1 flex items-center justify-center">
                            <Image
                                src="/sweet_flips (2).png"
                                alt="SweetFlips Logo"
                                width={360}
                                height={120}
                                className="h-24 w-auto object-contain"
                                priority
                            />
                        </div>
                        <div className="flex items-center gap-4 ml-auto">
                            <ThemeToggle variant="button" />
                            <ProfileDropdown
                                user={userData}
                                onLogout={() => {
                                    localStorage.removeItem('kick_access_token')
                                    localStorage.removeItem('kick_refresh_token')
                                    router.push('/login')
                                }}
                            />
                        </div>
                    </div>
                </nav>

                {/* Page Content */}
                <main className="p-6">
                    {children}
                </main>
            </div>

            {/* Sidebar Overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/70 z-30 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                ></div>
            )}
        </div>
    )
}
