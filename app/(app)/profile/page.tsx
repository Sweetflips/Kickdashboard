'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Script from 'next/script'
import ThemeToggle from '@/components/ThemeToggle'
import { useToast } from '@/components/Toast'
import { ACHIEVEMENTS } from '@/lib/achievements'

interface UserData {
    id?: number
    username?: string
    email?: string
    profile_picture?: string
    bio?: string
    [key: string]: any
}

type TabType = 'general' | 'preferences' | 'connected' | 'achievements' | 'security' | 'admin_tools'

interface ConnectedAccount {
    provider: 'kick' | 'discord' | 'telegram' | 'twitter' | 'instagram'
    connected: boolean
    username?: string
    userId?: string
}

type AchievementRuntimeStatus = { unlocked: boolean; claimed: boolean }

export default function ProfilePage() {
    const [userData, setUserData] = useState<UserData | null>(null)
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<TabType>('general')
    const [notifications, setNotifications] = useState(true)
    const [emailNotifications, setEmailNotifications] = useState(false)
    const [customProfilePicture, setCustomProfilePicture] = useState<string | null>(null)
    const [uploading, setUploading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [saveMessage, setSaveMessage] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([])
    const [loadingAccounts, setLoadingAccounts] = useState(false)
    const [telegramAuthUrl, setTelegramAuthUrl] = useState<string | null>(null)
    const [achievementStatuses, setAchievementStatuses] = useState<Record<string, AchievementRuntimeStatus>>({})
    const [loadingAchievements, setLoadingAchievements] = useState(false)
    const [connectAchievementBanner, setConnectAchievementBanner] = useState<{ visible: boolean; label: string } | null>(null)
    const { showToast } = useToast()
    const [isAdminUser, setIsAdminUser] = useState(false)

    const [adminSearch, setAdminSearch] = useState('')
    const [adminResults, setAdminResults] = useState<any[]>([])
    const [adminSelectedKickUserId, setAdminSelectedKickUserId] = useState<string>('')
    const [adminSelectedUsername, setAdminSelectedUsername] = useState<string>('')
    const [adminLoading, setAdminLoading] = useState(false)
    const [adminAwardAmount, setAdminAwardAmount] = useState('')
    const [adminAwardReason, setAdminAwardReason] = useState('')

    // Referral code state
    const [referralInfo, setReferralInfo] = useState<{
        hasReferral: boolean
        canAddReferral: boolean
        accountAge: number
        referrerUsername?: string
    } | null>(null)
    const [referralCodeInput, setReferralCodeInput] = useState('')
    const [addingReferral, setAddingReferral] = useState(false)
    const [referralCodeCopied, setReferralCodeCopied] = useState(false)

    const fetchUserData = async () => {
        try {
            const token = localStorage.getItem('kick_access_token')
            if (!token) return

            const response = await fetch(`/api/user?access_token=${encodeURIComponent(token)}`)
            if (response.ok) {
                const data = await response.json()
                setUserData(data)
            }
        } catch (err) {
            console.error('Failed to fetch user data:', err)
        } finally {
            setLoading(false)
        }
    }

    const fetchConnectedAccounts = useCallback(async () => {
        if (!userData?.id) return

        setLoadingAccounts(true)
        try {
            console.log(`🔄 [PROFILE] Fetching connected accounts for user: ${userData.id}`)
            const response = await fetch(`/api/connected-accounts?kick_user_id=${userData.id}`)
            if (response.ok) {
                const data = await response.json()
                console.log(`✅ [PROFILE] Received connected accounts:`, data.accounts)
                setConnectedAccounts(data.accounts || [])
            } else {
                console.error(`❌ [PROFILE] Failed to fetch connected accounts: ${response.status}`)
            }
        } catch (error) {
            console.error('❌ [PROFILE] Failed to fetch connected accounts:', error)
        } finally {
            setLoadingAccounts(false)
        }
    }, [userData?.id])

    const fetchAchievements = useCallback(async () => {
        setLoadingAchievements(true)
        try {
            const token = localStorage.getItem('kick_access_token')
            if (!token) return

            const response = await fetch(`/api/achievements?access_token=${encodeURIComponent(token)}`)
            if (!response.ok) return

            const data = await response.json()
            if (Array.isArray(data.achievements)) {
                const statusMap: Record<string, AchievementRuntimeStatus> = {}
                for (const a of data.achievements) {
                    if (a && typeof a.id === 'string') {
                        statusMap[a.id] = { unlocked: !!a.unlocked, claimed: !!a.claimed }
                    }
                }
                setAchievementStatuses(statusMap)
            }
        } catch (error) {
            console.error('❌ [PROFILE] Failed to fetch achievements:', error)
        } finally {
            setLoadingAchievements(false)
        }
    }, [])

    const claimAchievement = async (achievementId: string) => {
        try {
            const token = localStorage.getItem('kick_access_token')
            if (!token) {
                showToast('Not authenticated', 'error')
                return
            }

            const res = await fetch(`/api/achievements/claim?access_token=${encodeURIComponent(token)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ achievementId }),
            })

            const payload = await res.json().catch(() => ({}))
            if (!res.ok) {
                showToast(payload?.error || 'Failed to claim achievement', 'error')
                return
            }

            if (payload?.alreadyClaimed) {
                showToast('Already claimed', 'info')
            } else {
                const pts = typeof payload?.sweetCoinsAwarded === 'number' ? payload.sweetCoinsAwarded : null
                showToast(
                    <span className="text-base font-semibold text-gray-900 dark:text-kick-text">
                        Achievement claimed{pts != null ? ` (+${pts.toLocaleString()} Sweet Coins)` : ''}!
                    </span>,
                    'success',
                    3000,
                    'Achievement Claimed'
                )
            }

            await fetchAchievements()
        } catch (e) {
            console.error('Error claiming achievement:', e)
            showToast('Failed to claim achievement', 'error')
        }
    }

    const handleConnectAccount = async (provider: 'discord' | 'telegram' | 'twitter' | 'instagram') => {
        if (!userData?.id) {
            showToast('User data not available', 'error')
            return
        }

        if (provider === 'telegram') {
            // For Telegram, use the widget with kick_user_id parameter
            // The widget will call the callback with kick_user_id for linking
            setTelegramAuthUrl(`/api/tg-auth/callback?kick_user_id=${userData.id}`)
            return
        }

        try {
            const response = await fetch(`/api/oauth/${provider}/connect`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kick_user_id: userData.id }),
            })

            if (response.ok) {
                const data = await response.json()
                if (data.authUrl) {
                    window.location.href = data.authUrl
                } else {
                    showToast('Failed to get authorization URL', 'error')
                }
            } else {
                const errorData = await response.json().catch(() => ({ error: 'Failed to initiate connection' }))
                showToast(errorData.error || `Failed to connect ${provider}`, 'error')
            }
        } catch (error) {
            console.error('Failed to connect account:', error)
            showToast(`Failed to connect ${provider} account`, 'error')
        }
    }

    const handleDisconnectAccount = async (provider: 'discord' | 'telegram' | 'twitter' | 'instagram') => {
        if (!userData?.id) return

        // Use a custom confirmation toast-like approach or proceed directly
        try {
            const response = await fetch(`/api/connected-accounts/disconnect`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    kick_user_id: userData.id,
                    provider,
                }),
            })

            if (response.ok) {
                await fetchConnectedAccounts()
                showToast(`${provider} account disconnected successfully`, 'success')
            } else {
                throw new Error('Failed to disconnect')
            }
        } catch (error) {
            console.error('Failed to disconnect account:', error)
            showToast('Failed to disconnect account', 'error')
        }
    }

    const fetchReferralInfo = useCallback(async () => {
        if (!userData?.id) return

        try {
            const response = await fetch('/api/referrals/check')
            if (response.ok) {
                const data = await response.json()
                setReferralInfo({
                    hasReferral: data.hasReferral,
                    canAddReferral: data.canAddReferral,
                    accountAge: data.accountAge,
                    referrerUsername: data.referrerUsername,
                })
            }
        } catch (error) {
            console.error('Failed to fetch referral info:', error)
        }
    }, [userData?.id])

    useEffect(() => {
        fetchUserData()
        ;(async () => {
            try {
                const token = localStorage.getItem('kick_access_token')
                if (!token) return
                const resp = await fetch('/api/admin/verify', { headers: { Authorization: `Bearer ${token}` } })
                const data = await resp.json().catch(() => ({}))
                setIsAdminUser(data?.is_admin === true)
            } catch {
                setIsAdminUser(false)
            }
        })()
        // Check URL params on mount to set active tab
        const params = new URLSearchParams(window.location.search)
        const tab = params.get('tab')
        const connect = params.get('connect')

        if (tab === 'connected') {
            setActiveTab('connected')
        } else if (tab === 'achievements') {
            setActiveTab('achievements')
        }

        // Auto-start Telegram connect flow if requested
        if (connect === 'telegram' && tab === 'connected') {
            // Will be handled after userData loads
        }
    }, [])

    useEffect(() => {
        if (userData?.id && activeTab === 'general') {
            fetchReferralInfo()
        }
    }, [userData?.id, activeTab, fetchReferralInfo])

    useEffect(() => {
        if (userData?.id && activeTab === 'connected') {
            fetchConnectedAccounts()
        }
    }, [userData?.id, activeTab, fetchConnectedAccounts])

    useEffect(() => {
        // Auto-start Telegram connect if requested via URL
        if (userData?.id && activeTab === 'connected') {
            const params = new URLSearchParams(window.location.search)
            const connect = params.get('connect')
            if (connect === 'telegram') {
                // Check if Telegram is already connected
                const telegram = connectedAccounts.find(acc => acc.provider === 'telegram')
                if (!telegram?.connected && !telegramAuthUrl) {
                    handleConnectAccount('telegram')
                    // Clean URL to avoid re-triggering
                    const newUrl = '/profile?tab=connected'
                    window.history.replaceState({}, '', newUrl)
                }
            }
        }
    }, [userData?.id, activeTab, connectedAccounts, telegramAuthUrl])

    useEffect(() => {
        if (activeTab === 'achievements') {
            fetchAchievements()
        }
    }, [activeTab, fetchAchievements])

    useEffect(() => {
        // Clear Telegram auth URL if Telegram is connected
        const telegram = connectedAccounts.find(acc => acc.provider === 'telegram')
        if (telegram?.connected) {
            setTelegramAuthUrl(null)
        }
    }, [connectedAccounts])

    useEffect(() => {
        // Handle URL parameters for OAuth callbacks
        const params = new URLSearchParams(window.location.search)
        const success = params.get('success')
        const error = params.get('error')
        const tab = params.get('tab')

        if (success && userData?.id) {
            console.log(`✅ [PROFILE] Success callback detected, refreshing connected accounts...`)
            if (tab === 'connected') {
                setActiveTab('connected')
            }
            if (success === 'discord_connected') {
                setConnectAchievementBanner({ visible: true, label: 'Discord Connected (+25 Sweet Coins) achievement unlocked' })
            } else if (success === 'twitter_connected') {
                setConnectAchievementBanner({ visible: true, label: 'Twitter Connected (+100 Sweet Coins) achievement unlocked' })
            } else if (success === 'instagram_connected') {
                setConnectAchievementBanner({ visible: true, label: 'Instagram Connected (+100 Sweet Coins) achievement unlocked' })
            } else if (success === 'true') {
                // Telegram widget currently redirects with success=true
                setConnectAchievementBanner({ visible: true, label: 'Telegram Connected (+25 Sweet Coins) achievement unlocked' })
            }
            // Clear Telegram widget state immediately
            setTelegramAuthUrl(null)
            // Refresh connected accounts after a short delay to ensure DB is updated
            setTimeout(() => {
                fetchConnectedAccounts()
                fetchAchievements()
            }, 500)
            showToast('Account connected successfully!', 'success')
            // Clean URL but preserve tab
            const newUrl = tab === 'connected' ? '/profile?tab=connected' : '/profile'
            window.history.replaceState({}, '', newUrl)
        } else if (error) {
            if (tab === 'connected') {
                setActiveTab('connected')
            }
            // Clear Telegram widget state on error
            setTelegramAuthUrl(null)
            showToast(`Failed to connect account: ${error}`, 'error')
            // Clean URL but preserve tab
            const newUrl = tab === 'connected' ? '/profile?tab=connected' : '/profile'
            window.history.replaceState({}, '', newUrl)
        }
    }, [userData?.id, fetchConnectedAccounts, fetchAchievements, showToast])

    // Also check URL params when userData becomes available (handles case where userData loads before URL check)
    useEffect(() => {
        if (!userData?.id) return

        const params = new URLSearchParams(window.location.search)
        const success = params.get('success')
        const tab = params.get('tab')

        if (success && tab === 'connected') {
            console.log(`✅ [PROFILE] Success callback detected (secondary check), refreshing connected accounts...`)
            setActiveTab('connected')
            setTimeout(() => {
                fetchConnectedAccounts()
            }, 500)
        }
    }, [userData?.id, fetchConnectedAccounts])

    useEffect(() => {
        // Load preferences from database when userData is available
        if (userData?.id) {
            const loadPreferences = async () => {
                try {
                    const token = localStorage.getItem('kick_access_token')
                    if (!token) return

                    const response = await fetch('/api/user/preferences', {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                        },
                    })
                    if (response.ok) {
                        const prefs = await response.json()
                        setCustomProfilePicture(prefs.custom_profile_picture_url || null)
                        setNotifications(prefs.notifications_enabled ?? true)
                        setEmailNotifications(prefs.email_notifications_enabled ?? false)
                    }
                } catch (error) {
                    console.error('Failed to load preferences:', error)
                }
            }
            loadPreferences()
        }
    }, [userData?.id])

    const handleProfilePictureUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file || !userData?.id) return

        setUploading(true)
        try {
            const formData = new FormData()
            formData.append('image', file)
            // Note: userId is no longer sent - server derives it from authenticated session

            const token = localStorage.getItem('kick_access_token')
            const response = await fetch('/api/profile/upload-picture', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
                body: formData,
            })

            if (response.ok) {
                const result = await response.json()
                setCustomProfilePicture(result.url)
                // Save to database
                const token = localStorage.getItem('kick_access_token')
                await fetch('/api/user/preferences', {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        custom_profile_picture_url: result.url,
                    }),
                })
                showToast('Profile picture uploaded successfully!', 'success')
            } else {
                const error = await response.json()
                showToast(error.error || 'Failed to upload profile picture', 'error')
            }
        } catch (error) {
            console.error('Failed to upload profile picture:', error)
            showToast('Failed to upload profile picture', 'error')
        } finally {
            setUploading(false)
            // Reset file input
            if (fileInputRef.current) {
                fileInputRef.current.value = ''
            }
        }
    }

    const handleSaveSettings = async () => {
        if (!userData?.id) return

        setSaving(true)
        setSaveMessage(null)

        try {
            // Save preferences to database
            const token = localStorage.getItem('kick_access_token')
            const response = await fetch('/api/user/preferences', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    notifications_enabled: notifications,
                    email_notifications_enabled: emailNotifications,
                }),
            })

            if (response.ok) {
                setSaveMessage('Settings saved successfully!')
                showToast('Settings saved successfully!', 'success')
            } else {
                throw new Error('Failed to save settings')
            }
            setTimeout(() => {
                setSaveMessage(null)
            }, 3000)
        } catch (error) {
            console.error('Failed to save settings:', error)
            setSaveMessage('Failed to save settings')
            showToast('Failed to save settings', 'error')
            setTimeout(() => {
                setSaveMessage(null)
            }, 3000)
        } finally {
            setSaving(false)
        }
    }

    const handleRemoveProfilePicture = async () => {
        if (userData?.id) {
            try {
                const token = localStorage.getItem('kick_access_token')
                await fetch('/api/user/preferences', {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        custom_profile_picture_url: null,
                    }),
                })
                setCustomProfilePicture(null)
                setSaveMessage('Custom profile picture removed')
                showToast('Custom profile picture removed', 'success')
                setTimeout(() => {
                    setSaveMessage(null)
                }, 3000)
            } catch (error) {
                console.error('Failed to remove profile picture:', error)
                showToast('Failed to remove profile picture', 'error')
            }
        }
    }

    const handleAddReferralCode = async () => {
        if (!referralCodeInput.trim() || !userData?.id) return

        setAddingReferral(true)
        try {
            const token = localStorage.getItem('kick_access_token')
            const response = await fetch('/api/referrals/set', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    referralCode: referralCodeInput.trim().toUpperCase(),
                }),
            })

            const data = await response.json()

            if (response.ok) {
                showToast('Referral code added successfully!', 'success')
                setReferralCodeInput('')
                await fetchReferralInfo()
            } else {
                showToast(data.error || 'Failed to add referral code', 'error')
            }
        } catch (error) {
            console.error('Failed to add referral code:', error)
            showToast('Failed to add referral code', 'error')
        } finally {
            setAddingReferral(false)
        }
    }

    const handleCopyReferralCode = () => {
        if (!userData?.username) return
        const code = userData.username.toUpperCase()
        navigator.clipboard.writeText(code)
        setReferralCodeCopied(true)
        showToast('Referral code copied!', 'success')
        setTimeout(() => setReferralCodeCopied(false), 2000)
    }

    const handleCopyReferralLink = () => {
        if (!userData?.username) return
        const link = `https://kickdashboard.com/signup?ref=${userData.username.toUpperCase()}`
        navigator.clipboard.writeText(link)
        showToast('Referral link copied!', 'success')
    }

    const tabs = [
        { id: 'general' as TabType, label: 'General', icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
        )},
        { id: 'preferences' as TabType, label: 'Preferences', icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
        )},
        { id: 'connected' as TabType, label: 'Connected Accounts', icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
        )},
        { id: 'achievements' as TabType, label: 'Achievements', icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.955a1 1 0 00.95.69h4.157c.969 0 1.371 1.24.588 1.81l-3.362 2.443a1 1 0 00-.364 1.118l1.286 3.955c.3.921-.755 1.688-1.54 1.118l-3.362-2.443a1 1 0 00-1.176 0l-3.362 2.443c-.784.57-1.838-.197-1.539-1.118l1.286-3.955a1 1 0 00-.364-1.118L2.98 9.382c-.783-.57-.38-1.81.588-1.81h4.157a1 1 0 00.95-.69l1.286-3.955z" />
            </svg>
        )},
        { id: 'security' as TabType, label: 'Security', icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
        )},
    ]

    const effectiveTabs = isAdminUser
        ? [
              ...tabs,
              {
                  id: 'admin_tools' as TabType,
                  label: 'Admin Tools',
                  icon: (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                  ),
              },
          ]
        : tabs

    const adminFetchUsers = async () => {
        const token = localStorage.getItem('kick_access_token')
        if (!token) return
        setAdminLoading(true)
        try {
            const resp = await fetch(`/api/admin/users?limit=25&offset=0&search=${encodeURIComponent(adminSearch)}`, {
                headers: { Authorization: `Bearer ${token}` },
            })
            const data = await resp.json().catch(() => ({}))
            if (!resp.ok) throw new Error(data?.error || 'Failed to search users')
            setAdminResults(Array.isArray(data?.users) ? data.users : [])
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Failed to search users', 'error')
            setAdminResults([])
        } finally {
            setAdminLoading(false)
        }
    }

    const adminUpdateUser = async (kickUserId: string, patch: any) => {
        const token = localStorage.getItem('kick_access_token')
        if (!token) return
        const resp = await fetch('/api/admin/users', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ kick_user_id: kickUserId, ...patch }),
        })
        const data = await resp.json().catch(() => ({}))
        if (!resp.ok) throw new Error(data?.error || 'Update failed')
        return data
    }

    const adminAwardSweetCoins = async () => {
        if (!adminSelectedKickUserId) return
        const token = localStorage.getItem('kick_access_token')
        if (!token) return
        const resp = await fetch('/api/admin/users/award-sweet-coins', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
                kick_user_id: adminSelectedKickUserId,
                sweet_coins: Number(adminAwardAmount),
                reason: adminAwardReason || null,
            }),
        })
        const data = await resp.json().catch(() => ({}))
        if (!resp.ok) throw new Error(data?.error || 'Award failed')
        showToast(data?.message || 'Updated', 'success')
    }

    const username = userData?.username || userData?.name || userData?.slug || userData?.display_name || 'User'
    const profilePictureRaw = userData?.profile_picture || userData?.avatar_url || userData?.avatar
    // Use custom profile picture if available, otherwise use Kick's profile picture
    const profilePicture = customProfilePicture || profilePictureRaw
    const initials = username.charAt(0).toUpperCase()

    return (
        <div className="space-y-6">
                {/* Header */}
                <div className="bg-white dark:bg-kick-surface rounded-lg shadow-sm border border-gray-200 dark:border-kick-border p-6">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-kick-text mb-2">Profile Settings</h1>
                    <p className="text-sm text-gray-600 dark:text-kick-text-secondary">Manage your account settings and preferences</p>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center h-64 bg-white dark:bg-kick-surface rounded-lg shadow-sm border border-gray-200 dark:border-kick-border">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kick-purple"></div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                        {/* Sidebar Navigation */}
                        <div className="lg:col-span-1">
                            <div className="bg-white dark:bg-kick-surface rounded-lg shadow-sm border border-gray-200 dark:border-kick-border p-4">
                                <nav className="space-y-2">
                                    {effectiveTabs.map((tab) => (
                                        <button
                                            key={tab.id}
                                            onClick={() => setActiveTab(tab.id)}
                                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                                                activeTab === tab.id
                                                    ? 'bg-kick-purple/10 dark:bg-kick-purple/20 text-kick-purple dark:text-kick-purple'
                                                    : 'text-gray-900 dark:text-kick-text-secondary hover:bg-gray-100 dark:hover:bg-kick-surface-hover'
                                            }`}
                                        >
                                            {tab.icon}
                                            <span className="font-medium whitespace-nowrap">{tab.label}</span>
                                        </button>
                                    ))}
                                </nav>
                            </div>
                        </div>

                        {/* Main Content */}
                        <div className="lg:col-span-3">
                            <div className="bg-white dark:bg-kick-surface rounded-lg shadow-sm border border-gray-200 dark:border-kick-border p-6">
                                {connectAchievementBanner?.visible && (
                                    <div className="mb-6 bg-kick-purple/10 dark:bg-kick-purple/20 border border-kick-purple/30 dark:border-kick-purple/50 rounded-lg p-4 flex items-start justify-between gap-4">
                                        <div>
                                            <p className="text-sm font-semibold text-gray-900 dark:text-kick-text">
                                                {connectAchievementBanner.label}
                                            </p>
                                            <p className="text-xs text-gray-600 dark:text-kick-text-secondary mt-1">
                                                Go claim it to add the Sweet Coins to your balance.
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => setActiveTab('achievements')}
                                                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-kick-green hover:bg-kick-green/90 text-white rounded-lg transition-all text-sm font-extrabold tracking-tight shadow-[0_10px_30px_rgba(34,197,94,0.25)] ring-1 ring-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-kick-green/60"
                                            >
                                                View & Claim
                                            </button>
                                            <button
                                                onClick={() => setConnectAchievementBanner({ visible: false, label: connectAchievementBanner.label })}
                                                className="inline-flex items-center justify-center px-3 py-1.5 bg-white/60 dark:bg-kick-surface border border-gray-200 dark:border-kick-border rounded-md transition-colors text-xs font-medium hover:bg-white dark:hover:bg-kick-surface-hover"
                                            >
                                                Dismiss
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* General Tab - Combined Overview, Profile, and Account */}
                                {activeTab === 'general' && (
                                    <div className="space-y-8">
                                        {/* Profile Picture Section */}
                                        <div>
                                            <h2 className="text-xl font-bold text-gray-900 dark:text-kick-text mb-4">Profile Picture</h2>
                                            <div className="flex items-center gap-6 p-4 bg-gray-50 dark:bg-kick-surface rounded-lg border border-gray-200 dark:border-kick-border">
                                                <div className="relative">
                                                    {profilePicture ? (
                                                        <img
                                                            src={profilePicture}
                                                            alt={username}
                                                            width={100}
                                                            height={100}
                                                            className="rounded-full border-4 border-white dark:border-kick-border object-cover"
                                                        />
                                                    ) : (
                                                        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center border-4 border-white dark:border-kick-border">
                                                            <span className="text-white text-4xl font-semibold">{initials}</span>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <input
                                                            ref={fileInputRef}
                                                            type="file"
                                                            accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                                                            onChange={handleProfilePictureUpload}
                                                            className="hidden"
                                                            id="profile-picture-upload"
                                                            disabled={uploading}
                                                        />
                                                        <label
                                                            htmlFor="profile-picture-upload"
                                                            className={`inline-flex items-center justify-center gap-1 px-2.5 py-1 bg-kick-purple hover:bg-kick-purple-dark text-white rounded-md transition-colors text-xs font-medium cursor-pointer ${
                                                                uploading ? 'opacity-50 cursor-not-allowed' : ''
                                                            }`}
                                                        >
                                                            {uploading ? 'Uploading...' : 'Change Picture'}
                                                        </label>
                                                        {customProfilePicture && (
                                                            <button
                                                                onClick={handleRemoveProfilePicture}
                                                                className="inline-flex items-center justify-center gap-1 px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors text-xs font-medium"
                                                            >
                                                                Remove
                                                            </button>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-gray-600 dark:text-kick-text-secondary">
                                                        JPG, GIF or PNG. Max size of 2MB
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Account Overview */}
                                        <div>
                                            <h2 className="text-xl font-bold text-gray-900 dark:text-kick-text mb-4">Account Overview</h2>
                                            <div className="bg-gray-50 dark:bg-kick-surface rounded-lg p-6 border border-gray-200 dark:border-kick-border">
                                                <div className="flex items-center gap-4 mb-6">
                                                    <div className="flex-1">
                                                        <h3 className="text-2xl font-bold text-gray-900 dark:text-kick-text mb-1">
                                                            {username}
                                                        </h3>
                                                        <p className="text-gray-600 dark:text-kick-text-secondary mb-3">
                                                            {userData?.email || 'No email available'}
                                                        </p>
                                                        <div className="flex items-center gap-2">
                                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-kick-green/20 text-kick-green dark:bg-kick-green/30 dark:text-kick-green">
                                                                <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                                                </svg>
                                                                Signed in with Kick
                                                            </span>
                                                            {customProfilePicture && (
                                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-kick-purple/20 text-kick-purple dark:bg-kick-purple/30 dark:text-kick-purple">
                                                                    Custom Picture
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Quick Stats */}
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                                    <div className="p-4 bg-white dark:bg-kick-surface-hover rounded-lg border border-gray-200 dark:border-kick-border">
                                                        <p className="text-sm text-gray-600 dark:text-kick-text-secondary mb-1">User ID</p>
                                                        <p className="text-lg font-semibold text-gray-900 dark:text-kick-text">
                                                            {userData?.id || 'N/A'}
                                                        </p>
                                                    </div>
                                                    <div className="p-4 bg-white dark:bg-kick-surface-hover rounded-lg border border-gray-200 dark:border-kick-border">
                                                        <p className="text-sm text-gray-600 dark:text-kick-text-secondary mb-1">Account Type</p>
                                                        <p className="text-lg font-semibold text-gray-900 dark:text-kick-text">
                                                            Kick User
                                                        </p>
                                                    </div>
                                                    <div className="p-4 bg-white dark:bg-kick-surface-hover rounded-lg border border-gray-200 dark:border-kick-border">
                                                        <p className="text-sm text-gray-600 dark:text-kick-text-secondary mb-1">Status</p>
                                                        <p className="text-lg font-semibold text-kick-green">
                                                            Active
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Account Information */}
                                        <div>
                                            <h2 className="text-xl font-bold text-gray-900 dark:text-kick-text mb-4">Account Information</h2>
                                            <div className="space-y-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-600 dark:text-kick-text-secondary mb-2">
                                                        Username
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={username}
                                                        disabled
                                                        className="w-full px-4 py-2 bg-gray-50 dark:bg-kick-surface-hover border border-gray-200 dark:border-kick-border rounded-lg text-gray-900 dark:text-kick-text cursor-not-allowed"
                                                    />
                                                    <p className="text-xs text-gray-600 dark:text-kick-text-secondary mt-1">
                                                        Your username is managed by Kick
                                                    </p>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-600 dark:text-kick-text-secondary mb-2">
                                                        Email Address
                                                    </label>
                                                    <input
                                                        type="email"
                                                        value={userData?.email || ''}
                                                        disabled
                                                        className="w-full px-4 py-2 bg-gray-50 dark:bg-kick-surface-hover border border-gray-200 dark:border-kick-border rounded-lg text-gray-900 dark:text-kick-text cursor-not-allowed"
                                                    />
                                                    <p className="text-xs text-gray-600 dark:text-kick-text-secondary mt-1">
                                                        Email is managed by your Kick account
                                                    </p>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-600 dark:text-kick-text-secondary mb-2">
                                                        Display Name
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={username}
                                                        disabled
                                                        className="w-full px-4 py-2 bg-gray-50 dark:bg-kick-surface-hover border border-gray-200 dark:border-kick-border rounded-lg text-gray-900 dark:text-kick-text cursor-not-allowed"
                                                    />
                                                    <p className="text-xs text-gray-600 dark:text-kick-text-secondary mt-1">
                                                        Your display name is managed by Kick
                                                    </p>
                                                </div>
                                                {userData?.bio && (
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-600 dark:text-kick-text-secondary mb-2">
                                                            Bio
                                                        </label>
                                                        <textarea
                                                            value={userData.bio}
                                                            disabled
                                                            rows={4}
                                                            className="w-full px-4 py-2 bg-gray-50 dark:bg-kick-surface-hover border border-gray-200 dark:border-kick-border rounded-lg text-gray-900 dark:text-kick-text cursor-not-allowed"
                                                        />
                                                        <p className="text-xs text-gray-600 dark:text-kick-text-secondary mt-1">
                                                            Bio is managed by Kick
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Referral Code Section */}
                                        <div className="border-t border-gray-200 dark:border-kick-border pt-6">
                                            <h2 className="text-xl font-bold text-gray-900 dark:text-kick-text mb-4">Referral Code</h2>

                                            {/* Your Referral Code */}
                                            <div className="mb-6">
                                                <label className="block text-sm font-medium text-gray-600 dark:text-kick-text-secondary mb-2">
                                                    Your Referral Code
                                                </label>
                                                <div className="flex items-center gap-2">
                                                    <div className="flex-1 px-4 py-3 bg-gray-50 dark:bg-kick-surface-hover border border-gray-200 dark:border-kick-border rounded-lg font-mono text-lg font-bold text-gray-900 dark:text-kick-text text-center">
                                                        {userData?.username?.toUpperCase() || 'N/A'}
                                                    </div>
                                                    <button
                                                        onClick={handleCopyReferralCode}
                                                        className="px-4 py-3 bg-kick-purple text-white rounded-lg font-medium hover:bg-kick-purple-dark transition-colors"
                                                    >
                                                        {referralCodeCopied ? 'Copied!' : 'Copy'}
                                                    </button>
                                                </div>
                                                <p className="text-xs text-gray-600 dark:text-kick-text-secondary mt-2">
                                                    Share this code with friends to earn rewards when they sign up!
                                                </p>
                                            </div>

                                            {/* Referral Link */}
                                            <div className="mb-6">
                                                <label className="block text-sm font-medium text-gray-600 dark:text-kick-text-secondary mb-2">
                                                    Your Referral Link
                                                </label>
                                                <div className="flex items-center gap-2">
                                                    <div className="flex-1 px-4 py-3 bg-gray-50 dark:bg-kick-surface-hover border border-gray-200 dark:border-kick-border rounded-lg text-sm text-gray-600 dark:text-kick-text-secondary truncate">
                                                        {userData?.username ? `https://kickdashboard.com/signup?ref=${userData.username.toUpperCase()}` : 'N/A'}
                                                    </div>
                                                    <button
                                                        onClick={handleCopyReferralLink}
                                                        className="px-4 py-3 bg-kick-purple text-white rounded-lg font-medium hover:bg-kick-purple-dark transition-colors"
                                                    >
                                                        Copy
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Add Referral Code (if eligible) */}
                                            {referralInfo?.canAddReferral && !referralInfo.hasReferral && (
                                                <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                                                    <h3 className="text-sm font-semibold text-gray-900 dark:text-kick-text mb-2">
                                                        Add Referral Code
                                                    </h3>
                                                    <p className="text-xs text-gray-600 dark:text-kick-text-secondary mb-4">
                                                        You can add a referral code within 24 hours of account creation. Enter the code of the person who referred you.
                                                    </p>
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="text"
                                                            placeholder="Enter referral code"
                                                            value={referralCodeInput}
                                                            onChange={(e) => setReferralCodeInput(e.target.value.toUpperCase())}
                                                            className="flex-1 px-4 py-2 bg-white dark:bg-kick-surface border border-gray-200 dark:border-kick-border rounded-lg text-sm text-gray-900 dark:text-kick-text focus:outline-none focus:ring-2 focus:ring-kick-purple/50 focus:border-kick-purple"
                                                            disabled={addingReferral}
                                                        />
                                                        <button
                                                            onClick={handleAddReferralCode}
                                                            disabled={addingReferral || !referralCodeInput.trim()}
                                                            className="px-4 py-2 bg-kick-green hover:bg-kick-green-dark text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            {addingReferral ? 'Adding...' : 'Add'}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Show referrer info if user has a referral */}
                                            {referralInfo?.hasReferral && referralInfo.referrerUsername && (
                                                <div className="mt-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                                                    <p className="text-sm text-gray-900 dark:text-kick-text">
                                                        <span className="font-semibold">Referred by:</span>{' '}
                                                        <span className="font-mono">{referralInfo.referrerUsername.toUpperCase()}</span>
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Connected Account */}
                                        <div className="border-t border-gray-200 dark:border-kick-border pt-6">
                                            <h2 className="text-xl font-bold text-gray-900 dark:text-kick-text mb-4">Connected Account</h2>
                                            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-kick-surface-hover rounded-lg border border-gray-200 dark:border-kick-border">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center">
                                                        <span className="text-white text-sm font-semibold">K</span>
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-medium text-gray-900 dark:text-kick-text">Kick Account</p>
                                                        <p className="text-xs text-gray-600 dark:text-kick-text-secondary">{userData?.email || username}</p>
                                                    </div>
                                                </div>
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-kick-green/20 text-kick-green dark:bg-kick-green/30 dark:text-kick-green">
                                                    Connected
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Preferences Tab */}
                                {activeTab === 'preferences' && (
                                    <div className="space-y-6">
                                        <div>
                                            <h2 className="text-xl font-bold text-gray-900 dark:text-kick-text mb-6">Preferences</h2>

                                            <div className="space-y-6">
                                                <div>
                                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-kick-text mb-4">Appearance</h3>
                                                    <div className="space-y-4">
                                                        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-kick-surface-hover rounded-lg">
                                                            <div>
                                                                <p className="text-sm font-medium text-gray-900 dark:text-kick-text">Theme</p>
                                                                <p className="text-xs text-gray-600 dark:text-kick-text-secondary">Switch between light and dark mode</p>
                                                            </div>
                                                            <ThemeToggle />
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="border-t border-gray-200 dark:border-kick-border pt-6">
                                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-kick-text mb-4">Notifications</h3>
                                                    <div className="space-y-4">
                                                        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-kick-surface-hover rounded-lg">
                                                            <div>
                                                                <p className="text-sm font-medium text-gray-900 dark:text-kick-text">Push Notifications</p>
                                                                <p className="text-xs text-gray-600 dark:text-kick-text-secondary">Receive chat notifications</p>
                                                            </div>
                                                            <button
                                                                onClick={() => setNotifications(!notifications)}
                                                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                                                    notifications ? 'bg-kick-green' : 'bg-gray-200 dark:bg-kick-surface-hover'
                                                                }`}
                                                            >
                                                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                                                    notifications ? 'translate-x-6' : 'translate-x-1'
                                                                }`}></span>
                                                            </button>
                                                        </div>
                                                        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-kick-surface-hover rounded-lg">
                                                            <div>
                                                                <p className="text-sm font-medium text-gray-900 dark:text-kick-text">Email Notifications</p>
                                                                <p className="text-xs text-gray-600 dark:text-kick-text-secondary">Receive email updates</p>
                                                            </div>
                                                            <button
                                                                onClick={() => setEmailNotifications(!emailNotifications)}
                                                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                                                    emailNotifications ? 'bg-kick-green' : 'bg-gray-200 dark:bg-kick-surface-hover'
                                                                }`}
                                                            >
                                                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                                                    emailNotifications ? 'translate-x-6' : 'translate-x-1'
                                                                }`}></span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Save Button */}
                                                <div className="border-t border-gray-200 dark:border-kick-border pt-6">
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            {saveMessage && (
                                                                <p className={`text-sm ${
                                                                    saveMessage.includes('successfully')
                                                                        ? 'text-kick-green'
                                                                        : 'text-red-600 dark:text-red-400'
                                                                }`}>
                                                                    {saveMessage}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <button
                                                            onClick={handleSaveSettings}
                                                            disabled={saving}
                                                            className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-kick-purple hover:bg-kick-purple-dark text-white rounded-md transition-colors text-xs font-medium ${
                                                                saving ? 'opacity-50 cursor-not-allowed' : ''
                                                            }`}
                                                        >
                                                            {saving ? (
                                                                <>
                                                                    <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                                    </svg>
                                                                    Saving...
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                                    </svg>
                                                                    Save Settings
                                                                </>
                                                            )}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Connected Accounts Tab */}
                                {activeTab === 'connected' && (
                                    <div className="space-y-6">
                                        <div>
                                            <h2 className="text-xl font-bold text-gray-900 dark:text-kick-text mb-6">Connected Accounts</h2>
                                            <p className="text-sm text-gray-600 dark:text-kick-text-secondary mb-6">
                                                Connect your accounts to enhance your experience. You can disconnect them at any time.
                                            </p>

                                            {loadingAccounts ? (
                                                <div className="flex items-center justify-center py-8">
                                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-kick-purple"></div>
                                                </div>
                                            ) : (
                                                <div className="space-y-4">
                                                    {/* Kick Account */}
                                                    <div className="p-4 bg-gray-50 dark:bg-kick-surface-hover rounded-lg border border-gray-200 dark:border-kick-border">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-4">
                                                                <div className="w-12 h-12 rounded-lg overflow-hidden flex items-center justify-center">
                                                                    <img
                                                                        src="/icons/kick.jpg"
                                                                        alt="Kick"
                                                                        width={48}
                                                                        height={48}
                                                                        className="w-full h-full object-cover"
                                                                        onError={(e) => {
                                                                            const target = e.currentTarget
                                                                            target.style.display = 'none'
                                                                            if (target.parentElement) {
                                                                                target.parentElement.innerHTML = '<span class="text-kick-green font-bold text-xl">K</span>'
                                                                            }
                                                                        }}
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <p className="text-sm font-medium text-gray-900 dark:text-kick-text">Kick</p>
                                                                    <p className="text-xs text-gray-600 dark:text-kick-text-secondary">
                                                                        {userData?.username || 'Connected'}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <button className="inline-flex items-center justify-center gap-1 px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors text-xs font-medium">
                                                                Disconnect
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Discord Account */}
                                                    {(() => {
                                                        const discord = connectedAccounts.find(acc => acc.provider === 'discord')
                                                        return (
                                                            <div className="p-4 bg-gray-50 dark:bg-kick-surface-hover rounded-lg border border-gray-200 dark:border-kick-border">
                                                                <div className="flex items-center justify-between">
                                                                    <div className="flex items-center gap-4">
                                                                        <div className="w-12 h-12 rounded-lg overflow-hidden flex items-center justify-center">
                                                                            <img
                                                                                src="/icons/discord.png"
                                                                                alt="Discord connected"
                                                                                width="16"
                                                                                height="16"
                                                                                className="object-contain w-4 h-4"
                                                                                title="Connected via Discord"
                                                                                style={{ width: '21px', height: '21px' }}
                                                                            />
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-sm font-medium text-gray-900 dark:text-kick-text">Discord</p>
                                                                            {discord?.connected ? (
                                                                                <p className="text-xs text-gray-600 dark:text-kick-text-secondary">
                                                                                    {discord.username || 'Connected'}
                                                                                </p>
                                                                            ) : (
                                                                                <p className="text-xs text-gray-600 dark:text-kick-text-secondary">
                                                                                    Not connected
                                                                                </p>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    {discord?.connected ? (
                                                                        <button
                                                                            onClick={() => {
                                                                                if (confirm('Are you sure you want to disconnect your Discord account?')) {
                                                                                    handleDisconnectAccount('discord')
                                                                                }
                                                                            }}
                                                                            className="inline-flex items-center justify-center gap-1 px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors text-xs font-medium"
                                                                        >
                                                                            Disconnect
                                                                        </button>
                                                                    ) : (
                                                                        <button
                                                                            onClick={() => handleConnectAccount('discord')}
                                                                            className="inline-flex items-center justify-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-colors text-xs font-medium"
                                                                        >
                                                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                                                                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
                                                                            </svg>
                                                                            Connect Discord
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )
                                                    })()}

                                                    {/* Telegram Account */}
                                                    {(() => {
                                                        const telegram = connectedAccounts.find(acc => acc.provider === 'telegram')
                                                        return (
                                                            <div className="p-4 bg-gray-50 dark:bg-kick-surface-hover rounded-lg border border-gray-200 dark:border-kick-border">
                                                                <div className="flex items-center justify-between">
                                                                    <div className="flex items-center gap-4">
                                                                        <div className="w-12 h-12 rounded-lg overflow-hidden flex items-center justify-center">
                                                                            <img
                                                                                src="/logos/telegram-logo.png"
                                                                                alt="Telegram connected"
                                                                                width="18"
                                                                                height="18"
                                                                                className="object-contain"
                                                                                title="Connected via Telegram"
                                                                                style={{ width: '32px', height: '32px' }}
                                                                            />
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-sm font-medium text-gray-900 dark:text-kick-text">Telegram</p>
                                                                            {telegram?.connected ? (
                                                                                <p className="text-xs text-gray-600 dark:text-kick-text-secondary">
                                                                                    {telegram.username || 'Connected'}
                                                                                </p>
                                                                            ) : (
                                                                                <p className="text-xs text-gray-600 dark:text-kick-text-secondary">
                                                                                    Not connected
                                                                                </p>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    {telegram?.connected ? (
                                                                        <button
                                                                            onClick={() => {
                                                                                if (confirm('Are you sure you want to disconnect your Telegram account?')) {
                                                                                    handleDisconnectAccount('telegram')
                                                                                }
                                                                            }}
                                                                            className="inline-flex items-center justify-center gap-1 px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors text-xs font-medium"
                                                                        >
                                                                            Disconnect
                                                                        </button>
                                                                    ) : (
                                                                        <>
                                                                            {telegramAuthUrl ? (
                                                                                <div className="flex flex-col items-end gap-2">
                                                                                    <div id="telegram-login-widget"></div>
                                                                                    <Script
                                                                                        id="telegram-widget-script"
                                                                                        key={telegramAuthUrl}
                                                                                        strategy="afterInteractive"
                                                                                        dangerouslySetInnerHTML={{
                                                                                            __html: `
                                                                                                (function() {
                                                                                                    if (typeof window !== 'undefined') {
                                                                                                        const container = document.getElementById('telegram-login-widget');
                                                                                                        if (container) {
                                                                                                            container.innerHTML = '';
                                                                                                            const script = document.createElement('script');
                                                                                                            script.async = true;
                                                                                                            script.src = 'https://telegram.org/js/telegram-widget.js?22';
                                                                                                            script.setAttribute('data-telegram-login', 'Sweetflipskickauthbot');
                                                                                                            script.setAttribute('data-size', 'medium');
                                                                                                            script.setAttribute('data-radius', '8');
                                                                                                            script.setAttribute('data-userpic', 'false');
                                                                                                            script.setAttribute('data-request-access', 'write');
                                                                                                            script.setAttribute('data-auth-url', window.location.origin + '${telegramAuthUrl}');
                                                                                                            container.appendChild(script);
                                                                                                        }
                                                                                                    }
                                                                                                })();
                                                                                            `,
                                                                                        }}
                                                                                    />
                                                                                </div>
                                                                            ) : (
                                                                                <button
                                                                                    onClick={() => handleConnectAccount('telegram')}
                                                                                    className="inline-flex items-center justify-center gap-1 px-2.5 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors text-xs font-medium"
                                                                                >
                                                                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                                                                        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.568 8.16l-1.704 8.04c-.128.576-.456.718-.927.446l-2.56-1.888-1.234 1.184c-.14.14-.258.258-.53.258l.184-2.608 4.736-4.28c.206-.184-.046-.286-.32-.104l-5.856 3.688-2.52-.788c-.54-.168-.554-.54.112-.804l9.856-3.8c.448-.16.84.112.696.696z"/>
                                                                                    </svg>
                                                                                    Connect Telegram
                                                                                </button>
                                                                            )}
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )
                                                    })()}

                                                    {/* Twitter Account */}
                                                    {(() => {
                                                        const twitter = connectedAccounts.find(acc => acc.provider === 'twitter')
                                                        return (
                                                            <div className="p-4 bg-gray-50 dark:bg-kick-surface-hover rounded-lg border border-gray-200 dark:border-kick-border">
                                                                <div className="flex items-center justify-between">
                                                                    <div className="flex items-center gap-4">
                                                                        <div className="w-12 h-12 rounded-lg overflow-hidden flex items-center justify-center bg-black">
                                                                            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                                                                                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                                                                            </svg>
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-sm font-medium text-gray-900 dark:text-kick-text">Twitter</p>
                                                                            {twitter?.connected ? (
                                                                                <p className="text-xs text-gray-600 dark:text-kick-text-secondary">
                                                                                    @{twitter.username || 'Connected'}
                                                                                </p>
                                                                            ) : (
                                                                                <p className="text-xs text-gray-600 dark:text-kick-text-secondary">
                                                                                    Not connected
                                                                                </p>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    {twitter?.connected ? (
                                                                        <button
                                                                            onClick={() => {
                                                                                if (confirm('Are you sure you want to disconnect your Twitter account?')) {
                                                                                    handleDisconnectAccount('twitter')
                                                                                }
                                                                            }}
                                                                            className="inline-flex items-center justify-center gap-1 px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors text-xs font-medium"
                                                                        >
                                                                            Disconnect
                                                                        </button>
                                                                    ) : (
                                                                        <button
                                                                            onClick={() => handleConnectAccount('twitter')}
                                                                            className="inline-flex items-center justify-center gap-1 px-2.5 py-1 bg-black hover:bg-gray-800 text-white rounded-md transition-colors text-xs font-medium"
                                                                        >
                                                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                                                                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                                                                            </svg>
                                                                            Connect Twitter
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )
                                                    })()}

                                                    {/* Instagram Account */}
                                                    {(() => {
                                                        const instagram = connectedAccounts.find(acc => acc.provider === 'instagram')
                                                        return (
                                                            <div className="p-4 bg-gray-50 dark:bg-kick-surface-hover rounded-lg border border-gray-200 dark:border-kick-border">
                                                                <div className="flex items-center justify-between">
                                                                    <div className="flex items-center gap-4">
                                                                        <div className="w-12 h-12 rounded-lg overflow-hidden flex items-center justify-center bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400">
                                                                            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                                                                                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                                                                            </svg>
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-sm font-medium text-gray-900 dark:text-kick-text">Instagram</p>
                                                                            {instagram?.connected ? (
                                                                                <p className="text-xs text-gray-600 dark:text-kick-text-secondary">
                                                                                    @{instagram.username || 'Connected'}
                                                                                </p>
                                                                            ) : (
                                                                                <p className="text-xs text-gray-600 dark:text-kick-text-secondary">
                                                                                    Not connected
                                                                                </p>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    {instagram?.connected ? (
                                                                        <button
                                                                            onClick={() => {
                                                                                if (confirm('Are you sure you want to disconnect your Instagram account?')) {
                                                                                    handleDisconnectAccount('instagram')
                                                                                }
                                                                            }}
                                                                            className="inline-flex items-center justify-center gap-1 px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors text-xs font-medium"
                                                                        >
                                                                            Disconnect
                                                                        </button>
                                                                    ) : (
                                                                        <button
                                                                            onClick={() => handleConnectAccount('instagram')}
                                                                            className="inline-flex items-center justify-center gap-1 px-2.5 py-1 bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400 hover:from-purple-700 hover:via-pink-600 hover:to-orange-500 text-white rounded-md transition-colors text-xs font-medium"
                                                                        >
                                                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                                                                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                                                                            </svg>
                                                                            Connect Instagram
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )
                                                    })()}
                                                </div>
                                            )}

                                            {saveMessage && (
                                                <div className={`mt-4 p-3 rounded-lg text-sm ${
                                                    saveMessage.includes('successfully')
                                                        ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200'
                                                        : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200'
                                                }`}>
                                                    {saveMessage}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Achievements Tab */}
                                {activeTab === 'achievements' && (
                                    <div className="space-y-6">
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <h2 className="text-xl font-bold text-gray-900 dark:text-kick-text">Achievements</h2>
                                                <p className="text-sm text-gray-600 dark:text-kick-text-secondary mt-1">
                                                    Your unlocked achievements show up here. Claim any that are ready to add Sweet Coins.
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => fetchAchievements()}
                                                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-kick-surface-hover text-gray-900 dark:text-kick-text rounded-md transition-colors text-xs font-medium hover:bg-gray-200 dark:hover:bg-kick-surface"
                                                disabled={loadingAchievements}
                                            >
                                                {loadingAchievements ? 'Refreshing…' : 'Refresh'}
                                            </button>
                                        </div>

                                        {(() => {
                                            const unlockedAchievements = ACHIEVEMENTS.filter((a) => achievementStatuses[a.id]?.unlocked)
                                            const claimableCount = unlockedAchievements.filter((a) => !achievementStatuses[a.id]?.claimed).length

                                            if (loadingAchievements && unlockedAchievements.length === 0) {
                                                return (
                                                    <div className="flex items-center justify-center h-40 bg-gray-50 dark:bg-kick-surface-hover rounded-lg border border-gray-200 dark:border-kick-border">
                                                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-kick-purple"></div>
                                                    </div>
                                                )
                                            }

                                            return (
                                                <div className="space-y-4">
                                                    {claimableCount > 0 && (
                                                        <div className="bg-kick-purple/10 dark:bg-kick-purple/20 border border-kick-purple/30 dark:border-kick-purple/50 rounded-lg p-4">
                                                            <p className="text-sm font-semibold text-gray-900 dark:text-kick-text">
                                                                {claimableCount} achievement{claimableCount === 1 ? '' : 's'} ready to claim
                                                            </p>
                                                            <p className="text-xs text-gray-600 dark:text-kick-text-secondary mt-1">
                                                                Claim them to add Sweet Coins to your balance.
                                                            </p>
                                                        </div>
                                                    )}

                                                    {unlockedAchievements.length === 0 ? (
                                                        <div className="p-6 bg-gray-50 dark:bg-kick-surface-hover rounded-lg border border-gray-200 dark:border-kick-border text-center">
                                                            <p className="text-sm font-medium text-gray-900 dark:text-kick-text">No unlocked achievements yet</p>
                                                            <p className="text-xs text-gray-600 dark:text-kick-text-secondary mt-1">
                                                                Watch streams, chat, join raffles, and connect accounts to unlock achievements.
                                                            </p>
                                                        </div>
                                                    ) : (
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            {unlockedAchievements.map((a) => {
                                                                const status = achievementStatuses[a.id]
                                                                const isClaimed = !!status?.claimed
                                                                return (
                                                                    <div
                                                                        key={a.id}
                                                                        className="p-4 bg-white dark:bg-kick-surface rounded-lg border border-gray-200 dark:border-kick-border"
                                                                    >
                                                                        <div className="flex items-start gap-3">
                                                                            <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-kick-dark flex items-center justify-center text-2xl flex-shrink-0">
                                                                                {a.icon}
                                                                            </div>
                                                                            <div className="flex-1 min-w-0">
                                                                                <div className="flex items-center justify-between gap-2">
                                                                                    <p className="text-sm font-semibold text-gray-900 dark:text-kick-text truncate">
                                                                                        {a.name}
                                                                                    </p>
                                                                                    <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                                                                                        isClaimed
                                                                                            ? 'bg-kick-purple/10 text-kick-purple dark:bg-kick-purple/20 dark:text-kick-purple'
                                                                                            : 'bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300'
                                                                                    }`}>
                                                                                        {isClaimed ? 'Claimed' : 'Unlocked'}
                                                                                    </span>
                                                                                </div>
                                                                                {a.requirement && (
                                                                                    <p className="text-xs text-gray-600 dark:text-kick-text-secondary mt-1">
                                                                                        {a.requirement}
                                                                                    </p>
                                                                                )}
                                                                                <div className="flex items-center justify-between mt-3 gap-3">
                                                                                    <p className="text-xs font-semibold text-kick-purple">
                                                                                        +{a.reward.toLocaleString()} Sweet Coins
                                                                                    </p>
                                                                                    {!isClaimed && (
                                                                                        <button
                                                                                            onClick={() => claimAchievement(a.id)}
                                                                                            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-kick-green hover:bg-kick-green/90 text-white rounded-lg transition-all text-sm font-extrabold tracking-tight shadow-[0_10px_30px_rgba(34,197,94,0.22)] ring-1 ring-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-kick-green/60"
                                                                                        >
                                                                                            Claim
                                                                                        </button>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                )
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })()}
                                    </div>
                                )}

                                {/* Security Tab */}
                                {activeTab === 'security' && (
                                    <div className="space-y-6">
                                        <div>
                                            <h2 className="text-xl font-bold text-gray-900 dark:text-kick-text mb-6">Security Settings</h2>

                                            <div className="space-y-6">
                                                <div>
                                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-kick-text mb-4">Authentication</h3>
                                                    <div className="space-y-4">
                                                        <div className="p-4 bg-gray-50 dark:bg-kick-surface-hover rounded-lg">
                                                            <div className="flex items-center justify-between mb-2">
                                                                <div>
                                                                    <p className="text-sm font-medium text-gray-900 dark:text-kick-text">Kick OAuth</p>
                                                                    <p className="text-xs text-gray-600 dark:text-kick-text-secondary">Signed in via Kick authentication</p>
                                                                </div>
                                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-kick-green/20 text-kick-green dark:bg-kick-green/30 dark:text-kick-green">
                                                                    Active
                                                                </span>
                                                            </div>
                                                            <p className="text-xs text-gray-600 dark:text-kick-text-secondary mt-2">
                                                                Account: {userData?.email || username}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="border-t border-gray-200 dark:border-kick-border pt-6">
                                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-kick-text mb-4">Session Management</h3>
                                                    <div className="space-y-4">
                                                        <div className="p-4 bg-gray-50 dark:bg-kick-surface-hover rounded-lg">
                                                            <div className="flex items-center justify-between">
                                                                <div>
                                                                    <p className="text-sm font-medium text-gray-900 dark:text-kick-text">Current Session</p>
                                                                    <p className="text-xs text-gray-600 dark:text-kick-text-secondary">You are currently signed in</p>
                                                                </div>
                                                                <span className="text-xs text-gray-600 dark:text-kick-text-secondary">
                                                                    Active Now
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="border-t border-gray-200 dark:border-kick-border pt-6">
                                                    <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-4">Danger Zone</h3>
                                                    <div className="space-y-4">
                                                        <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                                                            <div className="flex items-center justify-between">
                                                                <div>
                                                                    <p className="text-sm font-medium text-red-600 dark:text-red-300">Disconnect Account</p>
                                                                    <p className="text-xs text-red-600 dark:text-red-400">
                                                                        Disconnect your Kick account. You will need to log in again to use the app.
                                                                    </p>
                                                                </div>
                                                                <button
                                                                    onClick={() => {
                                                                        if (confirm('Are you sure you want to disconnect your Kick account? You will need to log in again to use the app.')) {
                                                                            localStorage.removeItem('kick_access_token')
                                                                            localStorage.removeItem('kick_refresh_token')
                                                                            window.location.href = '/login'
                                                                        }
                                                                    }}
                                                                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors text-xs font-medium"
                                                                >
                                                                    Disconnect
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Admin Tools Tab */}
                                {isAdminUser && activeTab === 'admin_tools' && (
                                    <div className="space-y-6">
                                        <div>
                                            <h2 className="text-xl font-bold text-gray-900 dark:text-kick-text mb-2">Admin Tools</h2>
                                            <p className="text-sm text-gray-600 dark:text-kick-text-secondary">
                                                Search a user and run admin actions.
                                            </p>
                                        </div>

                                        <div className="p-4 bg-gray-50 dark:bg-kick-surface-hover rounded-lg border border-gray-200 dark:border-kick-border space-y-3">
                                            <div className="flex flex-col sm:flex-row gap-2">
                                                <input
                                                    value={adminSearch}
                                                    onChange={(e) => setAdminSearch(e.target.value)}
                                                    placeholder="Search username or email…"
                                                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text"
                                                />
                                                <button
                                                    onClick={adminFetchUsers}
                                                    disabled={adminLoading || adminSearch.trim().length < 2}
                                                    className="px-4 py-2 bg-kick-purple text-white rounded-lg disabled:opacity-50"
                                                >
                                                    {adminLoading ? 'Searching…' : 'Search'}
                                                </button>
                                            </div>

                                            <select
                                                value={adminSelectedKickUserId}
                                                onChange={(e) => {
                                                    const id = e.target.value
                                                    setAdminSelectedKickUserId(id)
                                                    const match = adminResults.find((u) => String(u.kick_user_id) === id)
                                                    setAdminSelectedUsername(match?.username || '')
                                                }}
                                                className="w-full px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text"
                                            >
                                                <option value="">-- Select user --</option>
                                                {adminResults.map((u) => (
                                                    <option key={u.kick_user_id} value={String(u.kick_user_id)}>
                                                        {u.username} — {String(u.kick_user_id)}
                                                    </option>
                                                ))}
                                            </select>

                                            {adminSelectedKickUserId && (
                                                <div className="text-sm text-gray-700 dark:text-kick-text-secondary">
                                                    Selected: <span className="font-semibold text-gray-900 dark:text-kick-text">{adminSelectedUsername}</span> (<span className="font-mono">{adminSelectedKickUserId}</span>)
                                                </div>
                                            )}
                                        </div>

                                        {adminSelectedKickUserId && (
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                                <div className="p-4 bg-gray-50 dark:bg-kick-surface-hover rounded-lg border border-gray-200 dark:border-kick-border space-y-3">
                                                    <h3 className="text-sm font-semibold text-gray-900 dark:text-kick-text">Role / Flags</h3>
                                                    <div className="flex flex-wrap gap-2">
                                                        <button
                                                            onClick={async () => {
                                                                try {
                                                                    await adminUpdateUser(adminSelectedKickUserId, { is_admin: true })
                                                                    showToast('Admin granted', 'success')
                                                                } catch (e) {
                                                                    showToast(e instanceof Error ? e.message : 'Failed', 'error')
                                                                }
                                                            }}
                                                            className="px-3 py-2 rounded text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300"
                                                        >
                                                            Make Admin
                                                        </button>
                                                        <button
                                                            onClick={async () => {
                                                                try {
                                                                    await adminUpdateUser(adminSelectedKickUserId, { is_admin: false })
                                                                    showToast('Admin removed', 'success')
                                                                } catch (e) {
                                                                    showToast(e instanceof Error ? e.message : 'Failed', 'error')
                                                                }
                                                            }}
                                                            className="px-3 py-2 rounded text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300"
                                                        >
                                                            Remove Admin
                                                        </button>
                                                        <button
                                                            onClick={async () => {
                                                                try {
                                                                    await adminUpdateUser(adminSelectedKickUserId, { moderator_override: true })
                                                                    showToast('Mod enabled', 'success')
                                                                } catch (e) {
                                                                    showToast(e instanceof Error ? e.message : 'Failed', 'error')
                                                                }
                                                            }}
                                                            className="px-3 py-2 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300"
                                                        >
                                                            Make Mod
                                                        </button>
                                                        <button
                                                            onClick={async () => {
                                                                try {
                                                                    await adminUpdateUser(adminSelectedKickUserId, { moderator_override: false })
                                                                    showToast('Mod disabled', 'success')
                                                                } catch (e) {
                                                                    showToast(e instanceof Error ? e.message : 'Failed', 'error')
                                                                }
                                                            }}
                                                            className="px-3 py-2 rounded text-xs font-medium bg-gray-200 dark:bg-kick-dark text-gray-800 dark:text-kick-text"
                                                        >
                                                            Remove Mod
                                                        </button>
                                                        <button
                                                            onClick={async () => {
                                                                try {
                                                                    await adminUpdateUser(adminSelectedKickUserId, { is_excluded: true })
                                                                    showToast('Excluded', 'success')
                                                                } catch (e) {
                                                                    showToast(e instanceof Error ? e.message : 'Failed', 'error')
                                                                }
                                                            }}
                                                            className="px-3 py-2 rounded text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-900 dark:text-yellow-300"
                                                        >
                                                            Exclude
                                                        </button>
                                                        <button
                                                            onClick={async () => {
                                                                try {
                                                                    await adminUpdateUser(adminSelectedKickUserId, { is_excluded: false })
                                                                    showToast('Included', 'success')
                                                                } catch (e) {
                                                                    showToast(e instanceof Error ? e.message : 'Failed', 'error')
                                                                }
                                                            }}
                                                            className="px-3 py-2 rounded text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300"
                                                        >
                                                            Include
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="p-4 bg-gray-50 dark:bg-kick-surface-hover rounded-lg border border-gray-200 dark:border-kick-border space-y-3">
                                                    <h3 className="text-sm font-semibold text-gray-900 dark:text-kick-text">SweetCoins</h3>
                                                    <div className="flex flex-col gap-2">
                                                        <input
                                                            value={adminAwardAmount}
                                                            onChange={(e) => setAdminAwardAmount(e.target.value)}
                                                            placeholder="Amount (e.g. 100 or -100)"
                                                            type="number"
                                                            className="w-full px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text"
                                                        />
                                                        <input
                                                            value={adminAwardReason}
                                                            onChange={(e) => setAdminAwardReason(e.target.value)}
                                                            placeholder="Reason (optional)"
                                                            className="w-full px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text"
                                                        />
                                                        <button
                                                            onClick={async () => {
                                                                try {
                                                                    await adminAwardSweetCoins()
                                                                    setAdminAwardAmount('')
                                                                    setAdminAwardReason('')
                                                                } catch (e) {
                                                                    showToast(e instanceof Error ? e.message : 'Failed', 'error')
                                                                }
                                                            }}
                                                            disabled={!adminAwardAmount}
                                                            className="px-4 py-2 bg-kick-green text-white rounded-lg disabled:opacity-50"
                                                        >
                                                            Apply
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
    )
}
