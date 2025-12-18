'use client'

import { getAccessToken, getRefreshToken, setAuthTokens, getCookie, setCookie } from '@/lib/cookies'
import { getClientAccessToken } from '@/lib/auth-client'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Footer from './Footer'
import ProfileDropdown from './ProfileDropdown'
import ThemeToggle from './ThemeToggle'
import ConnectAccountsNudge from './ConnectAccountsNudge'
import LandingPage from './LandingPage'

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
    const [isAdmin, setIsAdmin] = useState<boolean>(() => {
        if (typeof window !== 'undefined') {
            // Check cookies first (more reliable), then localStorage as fallback
            const cookieValue = getCookie('is_admin')
            if (cookieValue !== null) {
                return cookieValue === 'true'
            }
            return localStorage.getItem('is_admin') === 'true'
        }
        return false
    })
    const [canViewPayouts, setCanViewPayouts] = useState<boolean>(false)
    const [utcTime, setUtcTime] = useState('')
    const [userPoints, setUserPoints] = useState<number | null>(null)
    const [pointsLoading, setPointsLoading] = useState(false)

    const fetchUserPoints = async (kickUserId?: number) => {
        if (!kickUserId) return
        try {
            setPointsLoading(true)
            const res = await fetch(`/api/sweet-coins?kick_user_id=${encodeURIComponent(String(kickUserId))}`)
            if (!res.ok) return
            const data = await res.json()
            const totalPoints = typeof data?.total_sweet_coins === 'number' ? data.total_sweet_coins : 0
            setUserPoints(totalPoints)
        } catch {
            // ignore
        } finally {
            setPointsLoading(false)
        }
    }

    useEffect(() => {
        const updateTime = () => {
            const now = new Date()
            const utcString = now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC'
            setUtcTime(utcString)
        }
        updateTime()
        const interval = setInterval(updateTime, 1000)
        return () => clearInterval(interval)
    }, [])

    useEffect(() => {
        // Check authentication
        if (typeof window !== 'undefined') {
            // Check cookies first, then localStorage (backward compatibility)
            const token = getAccessToken()
            const params = new URLSearchParams(window.location.search)

            // Handle auth callback - tokens are now only in cookies, not URL
            if (params.get('auth_success') === 'true') {
                // Fallback: tokens may be provided in the URL fragment (#...) if cookies were refused/dropped.
                // Fragments are not sent to the server; we should consume and then remove them immediately.
                try {
                    const hash = window.location.hash || ''
                    if (hash.startsWith('#')) {
                        const hashParams = new URLSearchParams(hash.slice(1))
                        const accessFromHash = hashParams.get('access_token')
                        const refreshFromHash = hashParams.get('refresh_token')
                        if (accessFromHash && accessFromHash.trim().length > 0) {
                            setAuthTokens(accessFromHash, refreshFromHash || undefined)
                        }
                    }
                } catch {
                    // ignore
                }

                // Tokens are already set in cookies by the callback route
                // Retry reading cookies a few times as they may not be immediately available after redirect
                let retries = 0
                const maxRetries = 5
                const checkToken = () => {
                    const tokenFromCookie = getAccessToken()
                    if (tokenFromCookie && tokenFromCookie.trim().length > 0) {
                        setIsAuthenticated(true)
                        // Clean URL (remove auth_success param)
                        const newSearch = (window.location.search.replace(/[?&]auth_success=[^&]*/, '') || '').replace(/^&/, '?')
                        const newUrl = window.location.pathname + newSearch
                        window.history.replaceState({}, '', newUrl)
                    } else if (retries < maxRetries) {
                        retries++
                        // Retry after a short delay (cookies may not be immediately available)
                        setTimeout(checkToken, 100 * retries) // Exponential backoff: 100ms, 200ms, 300ms, etc.
                    } else {
                        console.error('❌ [AUTH CALLBACK] No token found in cookies after auth success (tried ' + maxRetries + ' times)')
                        router.push('/login?error=invalid_token')
                    }
                }
                checkToken()
                return
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

    // Check admin status separately using secure endpoint
    const checkAdminStatus = async () => {
        try {
            const token = getAccessToken()
            if (!token) {
                setIsAdmin(false)
                setCanViewPayouts(false)
                return
            }

            const response = await fetch('/api/admin/verify', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            })

            if (response.ok) {
                const data = await response.json()
                const adminStatus = data.is_admin === true
                const payoutsAccess = data.can_view_payouts === true
                setIsAdmin(adminStatus)
                setCanViewPayouts(payoutsAccess)
                // Store in both cookies and localStorage for reliability
                setCookie('is_admin', String(adminStatus))
                localStorage.setItem('is_admin', String(adminStatus))
            } else {
                setIsAdmin(false)
                setCanViewPayouts(false)
                // Clear both cookies and localStorage
                setCookie('is_admin', 'false')
                localStorage.setItem('is_admin', 'false')
            }
        } catch (error) {
            console.error('Error checking admin status:', error)
            setIsAdmin(false)
            setCanViewPayouts(false)
            // Clear both cookies and localStorage on error
            setCookie('is_admin', 'false')
            localStorage.setItem('is_admin', 'false')
        }
    }

    useEffect(() => {
        if (!isAuthenticated) return
        fetchUserData()
        checkAdminStatus()

        // Proactively refresh token every 15 minutes to prevent expiration
        const refreshInterval = setInterval(async () => {
            const refreshToken = getRefreshToken()
            const token = getAccessToken()
            if (refreshToken && token && userData?.id) {
                try {
                    const refreshResponse = await fetch('/api/auth/refresh', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            refresh_token: refreshToken,
                            kick_user_id: userData.id,
                        }),
                    })
                    if (refreshResponse.ok) {
                        const refreshData = await refreshResponse.json()
                        setAuthTokens(refreshData.access_token, refreshData.refresh_token)
                    }
                } catch (error) {
                    // Silent fail - don't interrupt user experience
                    console.debug('Background token refresh failed:', error)
                }
            }
        }, 15 * 60 * 1000) // Every 15 minutes

        return () => clearInterval(refreshInterval)
    }, [isAuthenticated, userData?.id])

    // Keep points fresh in header
    useEffect(() => {
        if (!isAuthenticated) return
        if (!userData?.id) return

        fetchUserPoints(userData.id)
        const interval = window.setInterval(() => fetchUserPoints(userData.id), 30_000)
        return () => window.clearInterval(interval)
    }, [isAuthenticated, userData?.id])

    // Background preload for admin analytics (route + data) so navigation feels instant.
    useEffect(() => {
        if (!isAuthenticated || !isAdmin) return
        if (typeof window === 'undefined') return

        const token = getAccessToken()
        if (!token) return

        // Route prefetch
        try {
            ;(router as any).prefetch?.('/admin/analytics')
        } catch {
            // ignore
        }

        const key = 'admin_analytics_prefetch_v1'
        const preload = async () => {
            try {
                // Skip if we already have very recent data in sessionStorage
                const existing = sessionStorage.getItem(key)
                if (existing) {
                    const parsed = JSON.parse(existing)
                    if (parsed?.ts && Date.now() - parsed.ts < 15_000) {
                        return
                    }
                }

                const res = await fetch('/api/admin/analytics/summary?topUsersLimit=50', {
                    headers: { Authorization: `Bearer ${token}` },
                })

                if (!res.ok) return
                const data = await res.json()
                sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }))
            } catch {
                // ignore
            }
        }

        // Use idle time if possible; fallback to short delay.
        const w = window as any
        if (typeof w.requestIdleCallback === 'function') {
            w.requestIdleCallback(preload, { timeout: 2000 })
        } else {
            const t = window.setTimeout(preload, 300)
            return () => window.clearTimeout(t)
        }
    }, [isAuthenticated, isAdmin, router])

    // Refresh user data when URL has success parameter (after OAuth callbacks)
    useEffect(() => {
        if (typeof window === 'undefined' || !isAuthenticated) return

        const params = new URLSearchParams(window.location.search)
        const success = params.get('success')

        // Refresh on any success value (discord_connected, true, etc.)
        if (success) {
            // Refresh user data after successful OAuth connection
            setTimeout(() => {
                fetchUserData()
                checkAdminStatus()
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
            const token = getClientAccessToken()
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
                // Admin status is checked separately via /api/admin/verify
            } else if (response.status === 401) {
                // Token expired, try to refresh
                const refreshToken = getRefreshToken()
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
                            setAuthTokens(refreshData.access_token, refreshData.refresh_token)
                            // Retry user fetch
                            const retryResponse = await fetch(`/api/user?access_token=${encodeURIComponent(refreshData.access_token)}`)
                            if (retryResponse.ok) {
                                const retryData = await retryResponse.json()
                                setUserData(retryData)
                                // Admin status is checked separately via /api/admin/verify
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

    // Show landing page on root path when not authenticated
    if (!isAuthenticated) {
        if (pathname === '/' || pathname === '') {
            return <LandingPage />
        }
        return (
            <div className="flex items-center justify-center h-screen bg-white dark:bg-kick-dark">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kick-purple"></div>
            </div>
        )
    }

    return (
        <div className="min-h-screen flex flex-col bg-white dark:bg-kick-dark">
            {/* Sidebar */}
            <aside
                className={`fixed top-0 left-0 z-40 w-64 h-screen transition-transform duration-200 ease-out transform-gpu will-change-transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 bg-white dark:bg-kick-surface border-r border-gray-200 dark:border-kick-border`}
            >
                <div className="h-full px-3 py-4 overflow-y-auto">
                    <div className="flex items-center justify-between mb-5 px-2">
                        <Link href="/" className="flex items-center gap-3">
                            <Image
                                src="/icons/kick.jpg"
                                alt="Kick Logo"
                                width={30}
                                height={30}
                                className="rounded-lg"
                                priority
                            />
                            <span className="text-sm font-extrabold text-gray-700/80 dark:text-kick-text-secondary uppercase tracking-widest">
                                Dashboard
                            </span>
                        </Link>
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
                            <Link href="/" className={`group flex items-center px-3 py-2.5 rounded-xl border transition-colors duration-150 ${pathname === '/' ? 'bg-gray-100/90 dark:bg-kick-surface-hover text-gray-900 dark:text-kick-text border-gray-200 dark:border-kick-border shadow-sm' : 'text-gray-600 dark:text-kick-text-secondary border-transparent hover:bg-gray-50 dark:hover:bg-kick-surface-hover hover:border-gray-200/80 dark:hover:border-kick-border hover:text-gray-900 dark:hover:text-kick-text'}`} onClick={() => {
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
                            <Link href="/activity" className={`group flex items-center px-3 py-2.5 rounded-xl border transition-colors duration-150 ${pathname === '/activity' || pathname?.startsWith('/activity/') ? 'bg-gray-100/90 dark:bg-kick-surface-hover text-gray-900 dark:text-kick-text border-gray-200 dark:border-kick-border shadow-sm' : 'text-gray-600 dark:text-kick-text-secondary border-transparent hover:bg-gray-50 dark:hover:bg-kick-surface-hover hover:border-gray-200/80 dark:hover:border-kick-border hover:text-gray-900 dark:hover:text-kick-text'}`} onClick={() => {
                                if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                                    setSidebarOpen(false)
                                }
                            }}>
                                <span className="w-5 h-5 flex items-center justify-center text-[18px] leading-none" aria-hidden="true">
                                    📌
                                </span>
                                <span className="ml-3 text-body font-medium">My Activity</span>
                            </Link>
                        </li>
                        <li>
                            <Link href="/leaderboard" className={`group flex items-center px-3 py-2.5 rounded-xl border transition-colors duration-150 ${pathname === '/leaderboard' ? 'bg-gray-100/90 dark:bg-kick-surface-hover text-gray-900 dark:text-kick-text border-gray-200 dark:border-kick-border shadow-sm' : 'text-gray-600 dark:text-kick-text-secondary border-transparent hover:bg-gray-50 dark:hover:bg-kick-surface-hover hover:border-gray-200/80 dark:hover:border-kick-border hover:text-gray-900 dark:hover:text-kick-text'}`} onClick={() => {
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
                        <li className="mt-4 mb-2">
                            <div className="flex items-center gap-2 px-2 py-2 text-sm font-extrabold text-gray-700/80 dark:text-kick-text-secondary uppercase tracking-widest">
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                                    <path d="M4 2a2 2 0 00-2 2v2a2 2 0 002 2v8a2 2 0 002 2h8a2 2 0 002-2V8a2 2 0 002-2V4a2 2 0 00-2-2H4zm0 2h12v2H4V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1z" />
                                </svg>
                                <span>Rewards</span>
                            </div>
                        </li>
                        <li>
                            <Link href="/raffles" className={`group flex items-center px-3 py-2.5 rounded-xl border transition-colors duration-150 ${pathname === '/raffles' ? 'bg-gray-100/90 dark:bg-kick-surface-hover text-gray-900 dark:text-kick-text border-gray-200 dark:border-kick-border shadow-sm' : 'text-gray-600 dark:text-kick-text-secondary border-transparent hover:bg-gray-50 dark:hover:bg-kick-surface-hover hover:border-gray-200/80 dark:hover:border-kick-border hover:text-gray-900 dark:hover:text-kick-text'}`} onClick={() => {
                                if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                                    setSidebarOpen(false)
                                }
                            }}>
                                <span className="w-5 h-5 flex items-center justify-center text-[18px] leading-none" aria-hidden="true">
                                    🎟
                                </span>
                                <span className="ml-3 text-body font-medium">Raffles</span>
                            </Link>
                        </li>
                        <li>
                            <Link href="/shop" className={`group flex items-center px-3 py-2.5 rounded-xl border transition-colors duration-150 ${pathname === '/shop' ? 'bg-gray-100/90 dark:bg-kick-surface-hover text-gray-900 dark:text-kick-text border-gray-200 dark:border-kick-border shadow-sm' : 'text-gray-600 dark:text-kick-text-secondary border-transparent hover:bg-gray-50 dark:hover:bg-kick-surface-hover hover:border-gray-200/80 dark:hover:border-kick-border hover:text-gray-900 dark:hover:text-kick-text'}`} onClick={() => {
                                if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                                    setSidebarOpen(false)
                                }
                            }}>
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M3 1a1 1 0 000 2h1.22l.305 1.222a.997.997 0 00.01.042l1.358 5.43-.893.892C3.74 11.846 4.632 14 6.414 14H15a1 1 0 000-2H6.414l1-1H14a1 1 0 00.894-.553l3-6A1 1 0 0017 3H6.28l-.31-1.243A1 1 0 005 1H3zM16 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM6.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
                                </svg>
                                <span className="ml-3 text-body font-medium">Shop</span>
                            </Link>
                        </li>
                        <li>
                            <Link href="/achievements" className={`group flex items-center px-3 py-2.5 rounded-xl border transition-colors duration-150 ${pathname === '/achievements' ? 'bg-gray-100/90 dark:bg-kick-surface-hover text-gray-900 dark:text-kick-text border-gray-200 dark:border-kick-border shadow-sm' : 'text-gray-600 dark:text-kick-text-secondary border-transparent hover:bg-gray-50 dark:hover:bg-kick-surface-hover hover:border-gray-200/80 dark:hover:border-kick-border hover:text-gray-900 dark:hover:text-kick-text'}`} onClick={() => {
                                if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                                    setSidebarOpen(false)
                                }
                            }}>
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M6 3.75A2.75 2.75 0 018.75 1h2.5A2.75 2.75 0 0114 3.75v.443c.572.055 1.14.122 1.706.2C17.053 4.582 18 5.75 18 7.07v3.469c0 1.126-.694 2.191-1.83 2.54-1.952.599-4.024.921-6.17.921s-4.219-.322-6.17-.921C2.694 12.73 2 11.665 2 10.539V7.07c0-1.321.947-2.489 2.294-2.676A41.047 41.047 0 016 4.193V3.75zm6.5 0v.325a41.622 41.622 0 00-5 0V3.75c0-.69.56-1.25 1.25-1.25h2.5c.69 0 1.25.56 1.25 1.25zM10 10a1 1 0 00-1 1v.01a1 1 0 001 1h.01a1 1 0 001-1V11a1 1 0 00-1-1H10z" clipRule="evenodd" />
                                    <path d="M3 15.055v-.684c.126.053.255.1.39.142 2.092.642 4.313.987 6.61.987 2.297 0 4.518-.345 6.61-.987.135-.041.264-.089.39-.142v.684c0 1.347-.985 2.53-2.363 2.686a41.454 41.454 0 01-9.274 0C3.985 17.585 3 16.402 3 15.055z" />
                                </svg>
                                <span className="ml-3 text-body font-medium">Achievements</span>
                            </Link>
                        </li>
                        <li>
                            <Link href="/referrals" className={`group flex items-center px-3 py-2.5 rounded-xl border transition-colors duration-150 ${pathname === '/referrals' ? 'bg-gray-100/90 dark:bg-kick-surface-hover text-gray-900 dark:text-kick-text border-gray-200 dark:border-kick-border shadow-sm' : 'text-gray-600 dark:text-kick-text-secondary border-transparent hover:bg-gray-50 dark:hover:bg-kick-surface-hover hover:border-gray-200/80 dark:hover:border-kick-border hover:text-gray-900 dark:hover:text-kick-text'}`} onClick={() => {
                                if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                                    setSidebarOpen(false)
                                }
                            }}>
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                                </svg>
                                <span className="ml-3 text-body font-medium">Referrals</span>
                            </Link>
                        </li>
                        {(isAdmin || canViewPayouts) && (
                            <>
                                <li className="mt-4 mb-2">
                                    <div className="px-2 py-2 text-sm font-extrabold text-gray-700/80 dark:text-kick-text-secondary uppercase tracking-widest">
                                        Admin
                                    </div>
                                </li>
                                {isAdmin && (
                                    <>
                                        <li>
                                            <Link href="/streams" className={`group flex items-center px-3 py-2.5 rounded-xl border transition-colors duration-150 ${pathname === '/streams' || pathname?.startsWith('/streams/') ? 'bg-gray-100/90 dark:bg-kick-surface-hover text-gray-900 dark:text-kick-text border-gray-200 dark:border-kick-border shadow-sm' : 'text-gray-600 dark:text-kick-text-secondary border-transparent hover:bg-gray-50 dark:hover:bg-kick-surface-hover hover:border-gray-200/80 dark:hover:border-kick-border hover:text-gray-900 dark:hover:text-kick-text'}`} onClick={() => {
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
                                        <li>
                                            <Link href="/admin/analytics" className={`group flex items-center px-3 py-2.5 rounded-xl border transition-colors duration-150 ${pathname === '/admin/analytics' || pathname === '/analytics' ? 'bg-gray-100/90 dark:bg-kick-surface-hover text-gray-900 dark:text-kick-text border-gray-200 dark:border-kick-border shadow-sm' : 'text-gray-600 dark:text-kick-text-secondary border-transparent hover:bg-gray-50 dark:hover:bg-kick-surface-hover hover:border-gray-200/80 dark:hover:border-kick-border hover:text-gray-900 dark:hover:text-kick-text'}`} onClick={() => {
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
                                            <Link href="/admin/ai-moderator" className={`group flex items-center px-3 py-2.5 rounded-xl border transition-colors duration-150 ${pathname === '/admin/ai-moderator' ? 'bg-gray-100/90 dark:bg-kick-surface-hover text-gray-900 dark:text-kick-text border-gray-200 dark:border-kick-border shadow-sm' : 'text-gray-600 dark:text-kick-text-secondary border-transparent hover:bg-gray-50 dark:hover:bg-kick-surface-hover hover:border-gray-200/80 dark:hover:border-kick-border hover:text-gray-900 dark:hover:text-kick-text'}`} onClick={() => {
                                                if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                                                    setSidebarOpen(false)
                                                }
                                            }}>
                                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fillRule="evenodd" d="M11.983 1.043a1 1 0 00-1.966 0l-.148.74a7.03 7.03 0 00-1.608.668l-.653-.44a1 1 0 00-1.387.277l-1 1.5a1 1 0 00.277 1.387l.653.44a7.1 7.1 0 000 1.336l-.653.44a1 1 0 00-.277 1.387l1 1.5a1 1 0 001.387.277l.653-.44c.512.28 1.05.507 1.608.668l.148.74a1 1 0 001.966 0l.148-.74a7.03 7.03 0 001.608-.668l.653.44a1 1 0 001.387-.277l1-1.5a1 1 0 00-.277-1.387l-.653-.44a7.1 7.1 0 000-1.336l.653-.44a1 1 0 00.277-1.387l-1-1.5a1 1 0 00-1.387-.277l-.653.44a7.03 7.03 0 00-1.608-.668l-.148-.74zM10 8a2 2 0 100 4 2 2 0 000-4z" clipRule="evenodd" />
                                                </svg>
                                                <span className="ml-3 text-body font-medium">AI Moderator</span>
                                            </Link>
                                        </li>
                                        <li>
                                            <Link href="/admin/raffles" className={`group flex items-center px-3 py-2.5 rounded-xl border transition-colors duration-150 ${pathname === '/admin/raffles' ? 'bg-gray-100/90 dark:bg-kick-surface-hover text-gray-900 dark:text-kick-text border-gray-200 dark:border-kick-border shadow-sm' : 'text-gray-600 dark:text-kick-text-secondary border-transparent hover:bg-gray-50 dark:hover:bg-kick-surface-hover hover:border-gray-200/80 dark:hover:border-kick-border hover:text-gray-900 dark:hover:text-kick-text'}`} onClick={() => {
                                                if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                                                    setSidebarOpen(false)
                                                }
                                            }}>
                                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                                    <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                                                    <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm9.707 5.707a1 1 0 00-1.414-1.414L9 12.586l-1.293-1.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                                </svg>
                                                <span className="ml-3 text-body font-medium">Raffles</span>
                                            </Link>
                                        </li>
                                        <li>
                                            <Link href="/admin/streams" className={`group flex items-center px-3 py-2.5 rounded-xl border transition-colors duration-150 ${pathname === '/admin/streams' ? 'bg-gray-100/90 dark:bg-kick-surface-hover text-gray-900 dark:text-kick-text border-gray-200 dark:border-kick-border shadow-sm' : 'text-gray-600 dark:text-kick-text-secondary border-transparent hover:bg-gray-50 dark:hover:bg-kick-surface-hover hover:border-gray-200/80 dark:hover:border-kick-border hover:text-gray-900 dark:hover:text-kick-text'}`} onClick={() => {
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
                                            <Link href="/admin/users" className={`group flex items-center px-3 py-2.5 rounded-xl border transition-colors duration-150 ${pathname === '/admin/users' ? 'bg-gray-100/90 dark:bg-kick-surface-hover text-gray-900 dark:text-kick-text border-gray-200 dark:border-kick-border shadow-sm' : 'text-gray-600 dark:text-kick-text-secondary border-transparent hover:bg-gray-50 dark:hover:bg-kick-surface-hover hover:border-gray-200/80 dark:hover:border-kick-border hover:text-gray-900 dark:hover:text-kick-text'}`} onClick={() => {
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
                                {canViewPayouts && (
                                    <li>
                                        <Link href="/admin/payouts" className={`group flex items-center px-3 py-2.5 rounded-xl border transition-colors duration-150 ${pathname === '/admin/payouts' ? 'bg-gray-100/90 dark:bg-kick-surface-hover text-gray-900 dark:text-kick-text border-gray-200 dark:border-kick-border shadow-sm' : 'text-gray-600 dark:text-kick-text-secondary border-transparent hover:bg-gray-50 dark:hover:bg-kick-surface-hover hover:border-gray-200/80 dark:hover:border-kick-border hover:text-gray-900 dark:hover:text-kick-text'}`} onClick={() => {
                                            if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                                                setSidebarOpen(false)
                                            }
                                        }}>
                                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                                <path d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4z" />
                                                <path fillRule="evenodd" d="M8 8a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2h-6a2 2 0 01-2-2V8zm7 2a1 1 0 11-2 0 1 1 0 012 0zm-3 4a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" clipRule="evenodd" />
                                            </svg>
                                            <span className="ml-3 text-body font-medium">Payouts</span>
                                        </Link>
                                    </li>
                                )}
                                {isAdmin && (
                                    <>
                                        <li>
                                            <Link href="/admin/purchases" className={`group flex items-center px-3 py-2.5 rounded-xl border transition-colors duration-150 ${pathname === '/admin/purchases' ? 'bg-gray-100/90 dark:bg-kick-surface-hover text-gray-900 dark:text-kick-text border-gray-200 dark:border-kick-border shadow-sm' : 'text-gray-600 dark:text-kick-text-secondary border-transparent hover:bg-gray-50 dark:hover:bg-kick-surface-hover hover:border-gray-200/80 dark:hover:border-kick-border hover:text-gray-900 dark:hover:text-kick-text'}`} onClick={() => {
                                                if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                                                    setSidebarOpen(false)
                                                }
                                            }}>
                                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fillRule="evenodd" d="M3 4a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm2 2V5h1v1H5zM3 13a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 01-1 1H4a1 1 0 01-1-1v-3zm2 2v-1h1v1H5zM13 3a1 1 0 00-1 1v3a1 1 0 001 1h3a1 1 0 001-1V4a1 1 0 00-1-1h-3zm1 2v1h1V5h-1z" clipRule="evenodd" />
                                                    <path d="M11 4a1 1 0 10-2 0v1a1 1 0 002 0V4zM10 7a1 1 0 011 1v1h2a1 1 0 110 2h-3a1 1 0 01-1-1V8a1 1 0 011-1zM16 9a1 1 0 100 2 1 1 0 000-2zM9 13a1 1 0 011-1h1a1 1 0 110 2v2a1 1 0 11-2 0v-3zM7 11a1 1 0 100-2H4a1 1 0 100 2h3zM17 13a1 1 0 01-1 1h-2a1 1 0 110-2h2a1 1 0 011 1zM16 17a1 1 0 100-2h-3a1 1 0 100 2h3z" />
                                                </svg>
                                                <span className="ml-3 text-body font-medium">Purchases</span>
                                            </Link>
                                        </li>
                                        <li>
                                            <Link href="/admin/promo-codes" className={`group flex items-center px-3 py-2.5 rounded-xl border transition-colors duration-150 ${pathname === '/admin/promo-codes' ? 'bg-gray-100/90 dark:bg-kick-surface-hover text-gray-900 dark:text-kick-text border-gray-200 dark:border-kick-border shadow-sm' : 'text-gray-600 dark:text-kick-text-secondary border-transparent hover:bg-gray-50 dark:hover:bg-kick-surface-hover hover:border-gray-200/80 dark:hover:border-kick-border hover:text-gray-900 dark:hover:text-kick-text'}`} onClick={() => {
                                                if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                                                    setSidebarOpen(false)
                                                }
                                            }}>
                                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                                    <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                                                    <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
                                                </svg>
                                                <span className="ml-3 text-body font-medium">Promo Codes</span>
                                            </Link>
                                        </li>
                                    </>
                                )}
                            </>
                        )}
                        <li className="mt-4 mb-2">
                            <div className="flex items-center gap-2 px-2 py-2 text-sm font-extrabold text-gray-700/80 dark:text-kick-text-secondary uppercase tracking-widest">
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                                    <path fillRule="evenodd" d="M10 2a5 5 0 00-3.536 8.536A7.002 7.002 0 003 17a1 1 0 102 0 5 5 0 0110 0 1 1 0 102 0 7.002 7.002 0 00-3.464-6.464A5 5 0 0010 2zm-3 5a3 3 0 116 0 3 3 0 01-6 0z" clipRule="evenodd" />
                                </svg>
                                <span>Account</span>
                            </div>
                        </li>
                        <li>
                            <Link href="/profile" className={`group flex items-center px-3 py-2.5 rounded-xl border transition-colors duration-150 ${pathname === '/profile' || pathname === '/settings' ? 'bg-gray-100/90 dark:bg-kick-surface-hover text-gray-900 dark:text-kick-text border-gray-200 dark:border-kick-border shadow-sm' : 'text-gray-600 dark:text-kick-text-secondary border-transparent hover:bg-gray-50 dark:hover:bg-kick-surface-hover hover:border-gray-200/80 dark:hover:border-kick-border hover:text-gray-900 dark:hover:text-kick-text'}`} onClick={() => {
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
            <div className="lg:ml-64 flex-1 flex flex-col">
                {/* Top Navigation */}
                <nav className="bg-white dark:bg-kick-surface border-b border-gray-200 dark:border-kick-border px-3 sm:px-4 py-2 sm:py-3 shadow-sm">
                    <div className="flex items-center justify-between gap-2 min-w-0">
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-shrink-0">
                            <button
                                onClick={() => setSidebarOpen(true)}
                                className="lg:hidden text-gray-600 dark:text-kick-text-secondary hover:text-gray-900 dark:hover:text-kick-text flex-shrink-0"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                </svg>
                            </button>
                            <Image
                                src="/logos/sweet-flips-logo.png"
                                alt="SweetFlips Logo"
                                width={360}
                                height={120}
                                className="h-12 sm:h-16 md:h-20 lg:h-24 w-auto object-contain flex-shrink-0"
                                sizes="(max-width: 640px) 120px, (max-width: 768px) 180px, (max-width: 1024px) 240px, 360px"
                                priority
                            />
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3 md:gap-4 min-w-0 flex-shrink-0">
                            {isAuthenticated && utcTime && (
                                <div className="hidden md:block text-sm text-gray-600 dark:text-kick-text-secondary font-mono flex-shrink-0">
                                    {utcTime}
                                </div>
                            )}
                            {isAuthenticated && userData?.id && (
                                <div
                                    className="flex items-center gap-2 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-full bg-gray-100 dark:bg-kick-surface-hover text-gray-900 dark:text-kick-text border border-gray-200 dark:border-kick-border flex-shrink-0"
                                    title="Sweet Coins"
                                >
                                    <Image
                                        src="/icons/Sweetflipscoin.png"
                                        alt=""
                                        width={32}
                                        height={32}
                                        className="w-8 h-8 flex-shrink-0"
                                    />
                                    <span className="text-xs sm:text-sm font-semibold tabular-nums whitespace-nowrap">
                                        {pointsLoading && userPoints === null ? '…' : (userPoints ?? 0).toLocaleString()}
                                    </span>
                                    <span className="hidden md:inline text-sm font-medium text-gray-600 dark:text-kick-text-secondary whitespace-nowrap">
                                        Sweet Coins
                                    </span>
                                </div>
                            )}
                            <ThemeToggle variant="button" />
                            <ProfileDropdown
                                user={userData}
                                onLogout={() => {
                                    localStorage.removeItem('kick_access_token')
                                    localStorage.removeItem('kick_refresh_token')
                                    localStorage.removeItem('is_admin')
                                    router.push('/login')
                                }}
                            />
                        </div>
                    </div>
                </nav>

                {/* Page Content */}
                <main className="p-4 sm:p-6 flex-1">
                    {children}
                </main>

                {/* Footer */}
                <Footer />
            </div>

            {/* Connect Accounts Nudge */}
            {isAuthenticated && userData?.id && (
                <ConnectAccountsNudge kickUserId={userData.id} />
            )}

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
