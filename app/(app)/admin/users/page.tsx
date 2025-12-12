'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

interface UserSession {
  session_id: string
  region: string | null
  country: string | null
  client_type: string | null
  user_agent: string | null
  ip_hash: string | null
  last_seen_at: string
  created_at: string
}

interface GeoLocation {
  country: string
  countryCode: string
  city: string
  region: string
  isp: string
}

interface User {
  id: string
  kick_user_id: string
  username: string
  email: string | null
  profile_picture_url: string | null
  is_admin: boolean
  total_points: number
  total_emotes: number
  created_at: string
  last_login_at: string | null
  // Connected accounts
  kick_connected: boolean
  discord_connected: boolean
  discord_username: string | null
  telegram_connected: boolean
  telegram_username: string | null
  // IP addresses
  last_ip_address: string | null
  signup_ip_address: string | null
  // Signup tracking
  signup_region: string | null
  signup_user_agent: string | null
  signup_referrer: string | null
  duplicate_flags: Array<{ user_id: string; username: string; reason: string }>
  session_diagnostics?: {
    total_sessions: number
    last_seen: string | null
    last_region: string | null
    last_country: string | null
    last_client_type: string | null
    recent_sessions: UserSession[]
    unique_regions: string[]
    unique_countries: string[]
    unique_client_types: string[]
  }
}

// Parse user agent to get device/browser info
function parseUserAgent(ua: string | null): { device: string; browser: string } {
  if (!ua) return { device: 'Unknown', browser: 'Unknown' }

  let device = 'Desktop'
  let browser = 'Unknown'

  // Device detection
  if (/Mobile|Android|iPhone|iPad|iPod/i.test(ua)) {
    if (/iPad/i.test(ua)) device = 'iPad'
    else if (/iPhone/i.test(ua)) device = 'iPhone'
    else if (/Android/i.test(ua)) device = 'Android'
    else device = 'Mobile'
  } else if (/Windows/i.test(ua)) {
    device = 'Windows'
  } else if (/Mac/i.test(ua)) {
    device = 'Mac'
  } else if (/Linux/i.test(ua)) {
    device = 'Linux'
  }

  // Browser detection
  if (/Chrome/i.test(ua) && !/Edge|Edg/i.test(ua)) browser = 'Chrome'
  else if (/Firefox/i.test(ua)) browser = 'Firefox'
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari'
  else if (/Edge|Edg/i.test(ua)) browser = 'Edge'
  else if (/Opera|OPR/i.test(ua)) browser = 'Opera'

  return { device, browser }
}

// Get client type icon
function getClientTypeIcon(clientType: string | null): string {
  switch (clientType?.toLowerCase()) {
    case 'mobile': return '📱'
    case 'web': return '🖥️'
    case 'embedded': return '📺'
    default: return '❓'
  }
}

// Format time ago
function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  const date = new Date(dateStr)
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / (1000 * 60))
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString()
}

// IP Geolocation cache
const geoCache = new Map<string, GeoLocation | null>()

// Lookup IP geolocation via secure server endpoint
async function lookupGeoLocation(ip: string, token: string): Promise<GeoLocation | null> {
  if (!ip) return null

  // Check cache first
  if (geoCache.has(ip)) {
    return geoCache.get(ip) || null
  }

  try {
    // Use server-side API to keep API key secure
    const response = await fetch(`/api/admin/geolocate?ip=${encodeURIComponent(ip)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!response.ok) {
      geoCache.set(ip, null)
      return null
    }

    const data = await response.json()
    if (!data.error) {
      const geo: GeoLocation = {
        country: data.country || 'Unknown',
        countryCode: data.countryCode || '',
        city: data.city || '',
        region: data.region || '',
        isp: data.isp || '',
      }
      geoCache.set(ip, geo)
      return geo
    }
    geoCache.set(ip, null)
    return null
  } catch {
    geoCache.set(ip, null)
    return null
  }
}

export default function UsersPage() {
  const router = useRouter()
  const [userData, setUserData] = useState<any>(null)
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [total, setTotal] = useState(0)
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set())
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set())
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false)
  const [geoLocations, setGeoLocations] = useState<Map<string, GeoLocation | null>>(new Map())
  const [showAwardModal, setShowAwardModal] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [awardPoints, setAwardPoints] = useState('')
  const [awardReason, setAwardReason] = useState('')
  const [awarding, setAwarding] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const limit = 50

  useEffect(() => {
    const token = localStorage.getItem('kick_access_token')
    if (!token) {
      router.push('/')
      return
    }

    fetch('/api/admin/verify', {
      headers: { 'Authorization': `Bearer ${token}` },
    })
      .then(res => res.json())
      .then(data => {
        if (!data.is_admin) {
          router.push('/')
          return
        }
        setUserData({ is_admin: true })
        fetchUsers()
      })
      .catch(() => router.push('/'))
  }, [router])

  useEffect(() => {
    if (userData?.is_admin) {
      fetchUsers()
    }
  }, [offset, search, userData])

  // Fetch geolocation for users with IPs
  useEffect(() => {
    const fetchGeoLocations = async () => {
      const token = localStorage.getItem('kick_access_token')
      if (!token) return

      const ipsToLookup = new Set<string>()
      users.forEach(user => {
        if (user.last_ip_address && !geoLocations.has(user.last_ip_address)) {
          ipsToLookup.add(user.last_ip_address)
        }
        if (user.signup_ip_address && !geoLocations.has(user.signup_ip_address)) {
          ipsToLookup.add(user.signup_ip_address)
        }
      })

      if (ipsToLookup.size === 0) return

      const newGeoLocations = new Map(geoLocations)

      // Batch lookup with small delay to avoid rate limiting
      for (const ip of ipsToLookup) {
        const geo = await lookupGeoLocation(ip, token)
        newGeoLocations.set(ip, geo)
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 50))
      }

      setGeoLocations(newGeoLocations)
    }

    if (users.length > 0) {
      fetchGeoLocations()
    }
  }, [users])

  const fetchUsers = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('kick_access_token')
      if (!token) return

      const searchParam = search ? `&search=${encodeURIComponent(search)}` : ''
      const response = await fetch(`/api/admin/users?limit=${limit}&offset=${offset}${searchParam}`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      })

      if (response.ok) {
        const data = await response.json()
        setUsers(data.users || [])
        setTotal(data.total || 0)
      }
    } catch (error) {
      console.error('Error fetching users:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleAdmin = async (kickUserId: string, currentStatus: boolean) => {
    if (!confirm(`Are you sure you want to ${currentStatus ? 'remove' : 'grant'} admin access?`)) return

    try {
      const token = localStorage.getItem('kick_access_token')
      if (!token) return

      const response = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ kick_user_id: kickUserId, is_admin: !currentStatus }),
        credentials: 'include',
      })

      if (response.ok) {
        await fetchUsers()
      } else {
        const error = await response.json()
        alert(`Failed: ${error.error}`)
      }
    } catch (error) {
      alert('Failed to update user')
    }
  }

  const toggleExpanded = (userId: string) => {
    const newExpanded = new Set(expandedUsers)
    if (newExpanded.has(userId)) {
      newExpanded.delete(userId)
    } else {
      newExpanded.add(userId)
    }
    setExpandedUsers(newExpanded)
  }

  const openAwardModal = (user: User) => {
    setSelectedUser(user)
    setAwardPoints('')
    setAwardReason('')
    setShowAwardModal(true)
  }

  const handleAwardPoints = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUser) return

    setAwarding(true)
    try {
      const token = localStorage.getItem('kick_access_token')
      if (!token) return

      const response = await fetch('/api/admin/users/award-points', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          kick_user_id: selectedUser.kick_user_id,
          points: parseInt(awardPoints),
          reason: awardReason || null,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setToast({ message: data.message, type: 'success' })
        setShowAwardModal(false)
        await fetchUsers()
      } else {
        setToast({ message: data.error || 'Failed to award points', type: 'error' })
      }
    } catch (error) {
      setToast({ message: 'Failed to award points', type: 'error' })
    } finally {
      setAwarding(false)
    }
  }

  if (!userData || !userData.is_admin) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kick-purple"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
        <div className="bg-white dark:bg-kick-surface rounded-lg shadow-sm border border-gray-200 dark:border-kick-border p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-kick-text">User Management</h1>
            <div className="text-sm text-gray-600 dark:text-kick-text-secondary">
              {total.toLocaleString()} total users
            </div>
          </div>

          {/* Search and Filters */}
          <div className="mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <input
              type="text"
              placeholder="Search by username or email..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setOffset(0)
              }}
              className="w-full max-w-md px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-surface text-gray-900 dark:text-kick-text focus:ring-2 focus:ring-kick-purple focus:border-transparent"
            />
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showDuplicatesOnly}
                onChange={(e) => {
                  setShowDuplicatesOnly(e.target.checked)
                  setOffset(0)
                }}
                className="w-4 h-4 rounded border-gray-300 dark:border-kick-border text-kick-purple focus:ring-kick-purple"
              />
              <span className="text-sm text-gray-700 dark:text-kick-text font-medium">
                Show duplicates only
              </span>
            </label>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kick-purple"></div>
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-12 text-gray-600 dark:text-kick-text-secondary">
              No users found.
            </div>
          ) : (
            <>
              {/* Users List */}
              <div className="space-y-3">
                {users
                  .filter(user => !showDuplicatesOnly || (user.duplicate_flags && user.duplicate_flags.length > 0))
                  .map((user) => {
                  const isExpanded = expandedUsers.has(user.id)
                  const diagnostics = user.session_diagnostics
                  const latestSession = diagnostics?.recent_sessions?.[0]
                  const { device, browser } = parseUserAgent(latestSession?.user_agent || null)
                  const hasDuplicates = user.duplicate_flags && user.duplicate_flags.length > 0

                  return (
                    <div
                      key={user.id}
                      className="border border-gray-200 dark:border-kick-border rounded-lg overflow-hidden"
                    >
                      {/* Main Row */}
                      <div
                        className="flex items-center gap-4 p-4 hover:bg-gray-50 dark:hover:bg-kick-surface-hover cursor-pointer transition-colors"
                        onClick={() => toggleExpanded(user.id)}
                      >
                        {/* Expand Arrow */}
                        <div className="text-gray-400 dark:text-kick-text-secondary">
                          {isExpanded ? '▼' : '▶'}
                        </div>

                        {/* Avatar */}
                        <div className="flex-shrink-0">
                          {user.profile_picture_url && !imageErrors.has(user.id) ? (
                            <img
                              src={user.profile_picture_url}
                              alt={user.username}
                              className="w-10 h-10 rounded-full object-cover bg-kick-dark"
                              onError={() => {
                                setImageErrors(prev => new Set(prev).add(user.id))
                              }}
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-kick-surface-hover flex items-center justify-center">
                              <span className="text-gray-600 dark:text-kick-text-secondary text-sm font-medium">
                                {user.username.charAt(0).toUpperCase()}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* User Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {/* Kick logo - always show since all users sign up via Kick */}
                            <img
                              src="/logos/kick-icon.svg"
                              alt="Kick"
                              title={`Kick: ${user.username}`}
                              className="w-5 h-5 flex-shrink-0"
                            />
                            <span className="font-medium text-gray-900 dark:text-kick-text truncate">
                              {user.username}
                            </span>
                            {/* Duplicate Flag Badge */}
                            {hasDuplicates && (
                              <span className="px-1.5 py-0.5 rounded text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 font-medium" title={`${user.duplicate_flags.length} potential duplicate account(s)`}>
                                ⚠️ Duplicate
                              </span>
                            )}
                            {/* Connected Account Badges */}
                            <div className="flex items-center gap-1.5">
                              {user.discord_connected && (
                                <img
                                  src="/icons/discord.png"
                                  alt="Discord connected"
                                  width="16"
                                  height="16"
                                  className="object-contain w-4 h-4"
                                  title="Connected via Discord"
                                  style={{ width: '21px', height: '21px' }}
                                />
                              )}
                              {user.telegram_connected && (
                                <img
                                  src="/logos/telegram-logo.png"
                                  alt="Telegram connected"
                                  width="18"
                                  height="18"
                                  className="object-contain"
                                  title="Connected via Telegram"
                                  style={{ width: '32px', height: '32px' }}
                                />
                              )}
                            </div>
                            {user.is_admin && (
                              <span className="px-1.5 py-0.5 rounded text-xs bg-kick-purple/20 text-kick-purple font-medium">
                                Admin
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-kick-text-secondary">
                            {user.email || 'No email'}
                          </div>
                        </div>

                        {/* Quick Session Info */}
                        <div className="hidden md:flex items-center gap-6 text-sm">
                          {/* IP & Location - always show */}
                          <div className="text-center min-w-[140px]">
                            <div className="text-xs text-gray-500 dark:text-kick-text-secondary">IP / Location</div>
                            {user.last_ip_address ? (
                              <div>
                                <div className="text-gray-900 dark:text-kick-text font-mono text-xs">
                                  {user.last_ip_address}
                                </div>
                                {geoLocations.get(user.last_ip_address) ? (
                                  <div className="text-kick-purple font-medium text-xs">
                                    {geoLocations.get(user.last_ip_address)?.city && `${geoLocations.get(user.last_ip_address)?.city}, `}
                                    {geoLocations.get(user.last_ip_address)?.countryCode || geoLocations.get(user.last_ip_address)?.country}
                                  </div>
                                ) : (
                                  <div className="text-gray-400 dark:text-kick-text-muted text-xs">Loading...</div>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-400 dark:text-kick-text-muted">No IP</span>
                            )}
                          </div>

                          {/* Last Active */}
                          <div className="text-center min-w-[80px]">
                            <div className="text-xs text-gray-500 dark:text-kick-text-secondary">Last Active</div>
                            <div className="text-gray-900 dark:text-kick-text font-medium">
                              {formatTimeAgo(diagnostics?.last_seen || user.last_login_at)}
                            </div>
                          </div>

                          {/* Client - only show if we have data */}
                          {diagnostics?.last_client_type && (
                            <div className="text-center min-w-[80px]">
                              <div className="text-xs text-gray-500 dark:text-kick-text-secondary">Client</div>
                              <div className="text-gray-900 dark:text-kick-text font-medium">
                                {getClientTypeIcon(diagnostics.last_client_type)} {diagnostics.last_client_type}
                              </div>
                            </div>
                          )}

                          {/* Sessions - only show if > 0 */}
                          {diagnostics && diagnostics.total_sessions > 0 && (
                            <div className="text-center min-w-[60px]">
                              <div className="text-xs text-gray-500 dark:text-kick-text-secondary">Sessions</div>
                              <div className="text-gray-900 dark:text-kick-text font-medium">
                                {diagnostics.total_sessions}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Points */}
                        <div className="text-right">
                          <div className="font-semibold text-kick-purple">{user.total_points.toLocaleString()}</div>
                          <div className="text-xs text-gray-500 dark:text-kick-text-secondary">points</div>
                        </div>

                        {/* Admin Toggle */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleAdmin(user.kick_user_id, user.is_admin)
                          }}
                          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                            user.is_admin
                              ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50'
                              : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50'
                          }`}
                        >
                          {user.is_admin ? 'Remove Admin' : 'Make Admin'}
                        </button>

                        {/* Award Points Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            openAwardModal(user)
                          }}
                          className="px-3 py-1.5 rounded text-xs font-medium transition-colors bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400"
                          title="Award or deduct points"
                        >
                          ± Points
                        </button>
                      </div>

                      {/* Expanded Details */}
                      {isExpanded && (
                        <div className="border-t border-gray-200 dark:border-kick-border bg-gray-50 dark:bg-kick-dark p-4">
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Account Info */}
                            <div>
                              <h4 className="text-sm font-semibold text-gray-900 dark:text-kick-text mb-3">Account Info</h4>
                              <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-gray-500 dark:text-kick-text-secondary">User ID:</span>
                                  <span className="text-gray-900 dark:text-kick-text font-mono">{user.kick_user_id}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500 dark:text-kick-text-secondary">Joined:</span>
                                  <span className="text-gray-900 dark:text-kick-text">{new Date(user.created_at).toLocaleDateString()}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500 dark:text-kick-text-secondary">Last Login:</span>
                                  <span className="text-gray-900 dark:text-kick-text">{user.last_login_at ? new Date(user.last_login_at).toLocaleString() : 'Never'}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500 dark:text-kick-text-secondary">Points:</span>
                                  <span className="text-kick-purple font-semibold">{user.total_points.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500 dark:text-kick-text-secondary">Emotes:</span>
                                  <span className="text-kick-green font-semibold">{user.total_emotes.toLocaleString()}</span>
                                </div>
                              </div>

                              {/* IP Address Details */}
                              <h4 className="text-sm font-semibold text-gray-900 dark:text-kick-text mt-4 mb-3">IP Addresses</h4>
                              <div className="space-y-2 text-sm">
                                <div>
                                  <span className="text-gray-500 dark:text-kick-text-secondary">Last IP:</span>
                                  {user.last_ip_address ? (
                                    <div className="mt-1">
                                      <span className="text-gray-900 dark:text-kick-text font-mono bg-gray-100 dark:bg-kick-surface-hover px-2 py-0.5 rounded">
                                        {user.last_ip_address}
                                      </span>
                                      {geoLocations.get(user.last_ip_address) && (
                                        <div className="text-xs text-kick-purple mt-1">
                                          📍 {geoLocations.get(user.last_ip_address)?.city && `${geoLocations.get(user.last_ip_address)?.city}, `}
                                          {geoLocations.get(user.last_ip_address)?.region && `${geoLocations.get(user.last_ip_address)?.region}, `}
                                          {geoLocations.get(user.last_ip_address)?.country}
                                          {geoLocations.get(user.last_ip_address)?.isp && (
                                            <span className="text-gray-500 dark:text-kick-text-muted"> • {geoLocations.get(user.last_ip_address)?.isp}</span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-gray-400 dark:text-kick-text-muted ml-2">None</span>
                                  )}
                                </div>
                                <div>
                                  <span className="text-gray-500 dark:text-kick-text-secondary">Signup IP:</span>
                                  {user.signup_ip_address ? (
                                    <div className="mt-1">
                                      <span className="text-gray-900 dark:text-kick-text font-mono bg-gray-100 dark:bg-kick-surface-hover px-2 py-0.5 rounded">
                                        {user.signup_ip_address}
                                      </span>
                                      {geoLocations.get(user.signup_ip_address) && (
                                        <div className="text-xs text-kick-purple mt-1">
                                          📍 {geoLocations.get(user.signup_ip_address)?.city && `${geoLocations.get(user.signup_ip_address)?.city}, `}
                                          {geoLocations.get(user.signup_ip_address)?.region && `${geoLocations.get(user.signup_ip_address)?.region}, `}
                                          {geoLocations.get(user.signup_ip_address)?.country}
                                          {geoLocations.get(user.signup_ip_address)?.isp && (
                                            <span className="text-gray-500 dark:text-kick-text-muted"> • {geoLocations.get(user.signup_ip_address)?.isp}</span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-gray-400 dark:text-kick-text-muted ml-2">None</span>
                                  )}
                                </div>
                              </div>

                              {/* Connected Accounts Detail */}
                              <h4 className="text-sm font-semibold text-gray-900 dark:text-kick-text mt-4 mb-3">Connected Accounts</h4>
                              <div className="space-y-2 text-sm">
                                <div className="flex items-center justify-between">
                                  <span className="text-gray-500 dark:text-kick-text-secondary">Kick:</span>
                                  <span className={user.kick_connected ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}>
                                    {user.kick_connected ? '✓ Connected' : '✗ Not connected'}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-gray-500 dark:text-kick-text-secondary">Discord:</span>
                                  <span className={user.discord_connected ? 'text-[#5865F2]' : 'text-gray-400'}>
                                    {user.discord_connected ? `✓ ${user.discord_username || 'Connected'}` : '✗ Not connected'}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-gray-500 dark:text-kick-text-secondary">Telegram:</span>
                                  <span className={user.telegram_connected ? 'text-[#0088cc]' : 'text-gray-400'}>
                                    {user.telegram_connected ? `✓ @${user.telegram_username || 'Connected'}` : '✗ Not connected'}
                                  </span>
                                </div>
                              </div>

                              {/* Duplicate Detection */}
                              {hasDuplicates && (
                                <>
                                  <h4 className="text-sm font-semibold text-yellow-800 dark:text-yellow-300 mt-4 mb-3">⚠️ Potential Duplicate Accounts</h4>
                                  <div className="space-y-2 text-sm">
                                    {user.duplicate_flags.map((flag, idx) => (
                                      <div key={idx} className="bg-yellow-50 dark:bg-yellow-900/20 rounded p-2 border border-yellow-200 dark:border-yellow-800">
                                        <div className="flex items-center justify-between">
                                          <span className="text-gray-700 dark:text-kick-text font-medium">{flag.username}</span>
                                          <span className="text-yellow-700 dark:text-yellow-400 text-xs">{flag.reason}</span>
                                        </div>
                                        <div className="text-xs text-gray-500 dark:text-kick-text-secondary mt-1">
                                          User ID: {flag.user_id}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </>
                              )}
                            </div>

                            {/* Session Diagnostics */}
                            <div>
                              <h4 className="text-sm font-semibold text-gray-900 dark:text-kick-text mb-3">
                                Session Diagnostics ({diagnostics?.total_sessions || 0} sessions)
                              </h4>

                              {diagnostics && diagnostics.total_sessions > 0 ? (
                                <>
                                  {/* Summary */}
                                  <div className="grid grid-cols-2 gap-3 mb-4">
                                    {diagnostics.unique_countries && diagnostics.unique_countries.length > 0 && (
                                      <div className="bg-white dark:bg-kick-surface rounded p-2">
                                        <div className="text-xs text-gray-500 dark:text-kick-text-secondary">Countries</div>
                                        <div className="text-sm text-gray-900 dark:text-kick-text font-medium">
                                          {diagnostics.unique_countries.slice(0, 3).join(', ')}
                                          {diagnostics.unique_countries.length > 3 && ` +${diagnostics.unique_countries.length - 3}`}
                                        </div>
                                      </div>
                                    )}
                                    {diagnostics.unique_regions && diagnostics.unique_regions.length > 0 && (
                                      <div className="bg-white dark:bg-kick-surface rounded p-2">
                                        <div className="text-xs text-gray-500 dark:text-kick-text-secondary">Regions</div>
                                        <div className="text-sm text-gray-900 dark:text-kick-text font-medium">
                                          {diagnostics.unique_regions.slice(0, 3).join(', ')}
                                          {diagnostics.unique_regions.length > 3 && ` +${diagnostics.unique_regions.length - 3}`}
                                        </div>
                                      </div>
                                    )}
                                    {diagnostics.unique_client_types && diagnostics.unique_client_types.length > 0 && (
                                      <div className="bg-white dark:bg-kick-surface rounded p-2">
                                        <div className="text-xs text-gray-500 dark:text-kick-text-secondary">Client Types</div>
                                        <div className="text-sm text-gray-900 dark:text-kick-text font-medium">
                                          {diagnostics.unique_client_types.map(t => `${getClientTypeIcon(t)} ${t}`).join(', ')}
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  {/* Recent Sessions */}
                                  <div className="text-xs font-semibold text-gray-700 dark:text-kick-text-secondary mb-2">Recent Sessions</div>
                                  <div className="space-y-2 max-h-48 overflow-y-auto">
                                    {diagnostics.recent_sessions.map((session, idx) => {
                                      const { device, browser } = parseUserAgent(session.user_agent)
                                      return (
                                        <div key={session.session_id || idx} className="bg-white dark:bg-kick-surface rounded p-2 text-xs">
                                          <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-2">
                                              <span>{getClientTypeIcon(session.client_type)}</span>
                                              <span className="font-medium text-gray-900 dark:text-kick-text">
                                                {session.country || session.region || 'Unknown'}
                                              </span>
                                              <span className="text-gray-500 dark:text-kick-text-secondary">
                                                • {session.client_type || 'Unknown'}
                                              </span>
                                            </div>
                                            <span className="text-gray-500 dark:text-kick-text-secondary">
                                              {formatTimeAgo(session.last_seen_at)}
                                            </span>
                                          </div>
                                          <div className="text-gray-500 dark:text-kick-text-secondary">
                                            {device} • {browser}
                                            {session.ip_hash && (
                                              <span className="ml-2 font-mono">IP: {session.ip_hash.substring(0, 8)}...</span>
                                            )}
                                          </div>
                                          <div className="text-gray-400 dark:text-kick-text-muted font-mono mt-1">
                                            Session: {session.session_id?.substring(0, 16) || 'N/A'}...
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </>
                              ) : (
                                <div className="text-sm text-gray-500 dark:text-kick-text-secondary">
                                  No session data available
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Pagination */}
              {total > limit && (
                <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200 dark:border-kick-border">
                  <button
                    onClick={() => setOffset(Math.max(0, offset - limit))}
                    disabled={offset === 0}
                    className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-kick-surface text-gray-700 dark:text-kick-text hover:bg-gray-200 dark:hover:bg-kick-surface-hover disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-600 dark:text-kick-text-secondary">
                    Showing {offset + 1}-{Math.min(offset + limit, total)} of {total.toLocaleString()}
                  </span>
                  <button
                    onClick={() => setOffset(offset + limit)}
                    disabled={offset + limit >= total}
                    className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-kick-surface text-gray-700 dark:text-kick-text hover:bg-gray-200 dark:hover:bg-kick-surface-hover disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>

      {/* Award Points Modal */}
      {showAwardModal && selectedUser && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-kick-surface rounded-xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-h3 font-semibold text-gray-900 dark:text-kick-text">
                Award/Deduct Points
              </h2>
              <button
                onClick={() => setShowAwardModal(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-kick-text-secondary dark:hover:text-kick-text"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-4 p-3 bg-gray-50 dark:bg-kick-dark rounded-lg">
              <p className="text-sm text-gray-600 dark:text-kick-text-secondary">User:</p>
              <p className="font-semibold text-gray-900 dark:text-kick-text">{selectedUser.username}</p>
              <p className="text-sm text-gray-600 dark:text-kick-text-secondary mt-1">
                Current Points: <span className="font-bold text-kick-purple">{selectedUser.total_points.toLocaleString()}</span>
              </p>
            </div>

            <form onSubmit={handleAwardPoints} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-kick-text-secondary mb-2">
                  Points Amount *
                </label>
                <input
                  type="number"
                  value={awardPoints}
                  onChange={(e) => setAwardPoints(e.target.value)}
                  placeholder="100 or -100"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text"
                  required
                  autoFocus
                />
                <p className="text-xs text-gray-500 dark:text-kick-text-muted mt-1">
                  Use positive numbers to award, negative to deduct
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-kick-text-secondary mb-2">
                  Reason (optional)
                </label>
                <input
                  type="text"
                  value={awardReason}
                  onChange={(e) => setAwardReason(e.target.value)}
                  placeholder="Manual adjustment, giveaway, etc."
                  className="w-full px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-dark text-gray-900 dark:text-kick-text"
                  maxLength={200}
                />
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <p className="text-xs text-blue-800 dark:text-blue-300">
                  ⚠️ This will immediately adjust the user's point balance. This action is logged in their point history.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAwardModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 dark:bg-kick-dark text-gray-700 dark:text-kick-text rounded-lg hover:bg-gray-300 dark:hover:bg-kick-surface-hover transition-colors font-medium"
                  disabled={awarding}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-kick-purple text-white rounded-lg hover:bg-kick-purple-dark transition-colors font-medium disabled:opacity-50"
                  disabled={awarding || !awardPoints}
                >
                  {awarding ? 'Processing...' : 'Confirm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50">
          <div className={`rounded-lg px-4 py-3 shadow-lg ${
            toast.type === 'success'
              ? 'bg-green-500 text-white'
              : 'bg-red-500 text-white'
          }`}>
            {toast.message}
          </div>
        </div>
      )}
    </div>
  )
}
