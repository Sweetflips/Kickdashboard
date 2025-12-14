import { db } from '@/lib/db'
import { memoryCache } from '@/lib/memory-cache'
import { getBroadcasterToken } from '@/lib/kick-api'

const KICK_API_BASE = 'https://api.kick.com/public/v1'
const KICK_CHANNEL_SLUG = process.env.KICK_CHANNEL_SLUG || 'sweetflips'

export async function getAuthenticatedUser(request: Request): Promise<{ kickUserId: bigint; userId: bigint } | null> {
  try {
    // Try Authorization header first
    const authHeader = request.headers.get('authorization')
    let accessToken = authHeader?.replace('Bearer ', '')

    // Fallback to query param
    if (!accessToken) {
      const { searchParams } = new URL(request.url)
      accessToken = searchParams.get('access_token') || undefined
    }

    // Fallback to cookies (for browser requests)
    if (!accessToken) {
      const cookieHeader = request.headers.get('cookie')
      if (cookieHeader) {
        const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
          const [key, value] = cookie.trim().split('=')
          if (key && value) {
            acc[key] = decodeURIComponent(value)
          }
          return acc
        }, {} as Record<string, string>)
        accessToken = cookies['kick_access_token'] || undefined
      }
    }

    if (!accessToken) {
      return null
    }

    // Fetch user from Kick API
    const response = await fetch(`${KICK_API_BASE}/users`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      return null
    }

    const apiResponse = await response.json()
    const userDataArray = apiResponse.data || []

    if (!Array.isArray(userDataArray) || userDataArray.length === 0) {
      return null
    }

    const userData = userDataArray[0]
    const kickUserId = BigInt(userData.user_id)

    // Find user in database
    const user = await db.user.findUnique({
      where: { kick_user_id: kickUserId },
      select: { id: true },
    })

    if (!user) {
      return null
    }

    return {
      kickUserId,
      userId: user.id,
    }
  } catch (error) {
    console.error('Error authenticating user:', error)
    return null
  }
}

export async function isAdmin(request: Request): Promise<boolean> {
  try {
    const auth = await getAuthenticatedUser(request)
    if (!auth) {
      return false
    }

    const user = await db.user.findUnique({
      where: { kick_user_id: auth.kickUserId },
      select: { is_admin: true },
    })

    return user?.is_admin === true
  } catch (error) {
    console.error('Error checking admin status:', error)
    return false
  }
}

/**
 * Fetch moderators list from Kick API v2
 * Cached for 5 minutes to avoid rate limits
 */
async function fetchKickModerators(): Promise<Set<string>> {
  const cacheKey = `kick_moderators:${KICK_CHANNEL_SLUG}`

  return memoryCache.getOrSet(
    cacheKey,
    async () => {
      try {
        const token = await getBroadcasterToken()
        const url = `https://kick.com/api/v2/channels/${KICK_CHANNEL_SLUG.toLowerCase()}/moderators`

        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
          },
        })

        if (!response.ok) {
          console.warn(`[Auth] Failed to fetch moderators: ${response.status}`)
          return new Set<string>()
        }

        const data = await response.json()

        // Parse flexibly - handle different response formats
        const moderators = new Set<string>()

        // Handle array format: [{ user_id: 123, username: "user" }, ...]
        if (Array.isArray(data)) {
          for (const item of data) {
            if (item.user_id) moderators.add(String(item.user_id))
            if (item.id) moderators.add(String(item.id))
            if (item.username) moderators.add(item.username.toLowerCase())
            if (item.user?.user_id) moderators.add(String(item.user.user_id))
            if (item.user?.id) moderators.add(String(item.user.id))
            if (item.user?.username) moderators.add(item.user.username.toLowerCase())
          }
        }
        // Handle object format: { data: [...], moderators: [...] }
        else if (data.data && Array.isArray(data.data)) {
          for (const item of data.data) {
            if (item.user_id) moderators.add(String(item.user_id))
            if (item.id) moderators.add(String(item.id))
            if (item.username) moderators.add(item.username.toLowerCase())
            if (item.user?.user_id) moderators.add(String(item.user.user_id))
            if (item.user?.id) moderators.add(String(item.user.id))
            if (item.user?.username) moderators.add(item.user.username.toLowerCase())
          }
        }
        else if (data.moderators && Array.isArray(data.moderators)) {
          for (const item of data.moderators) {
            if (item.user_id) moderators.add(String(item.user_id))
            if (item.id) moderators.add(String(item.id))
            if (item.username) moderators.add(item.username.toLowerCase())
            if (item.user?.user_id) moderators.add(String(item.user.user_id))
            if (item.user?.id) moderators.add(String(item.user.id))
            if (item.user?.username) moderators.add(item.user.username.toLowerCase())
          }
        }

        console.log(`[Auth] Fetched ${moderators.size} moderators from Kick API`)
        return moderators
      } catch (error) {
        console.error('[Auth] Error fetching moderators:', error)
        return new Set<string>()
      }
    },
    5 * 60 * 1000 // 5 minute TTL
  )
}

/**
 * Check if user is a moderator (auto-detected from Kick or manually overridden)
 */
export async function isModerator(request: Request): Promise<boolean> {
  try {
    const auth = await getAuthenticatedUser(request)
    if (!auth) {
      return false
    }

    const user = await db.user.findUnique({
      where: { kick_user_id: auth.kickUserId },
      select: { moderator_override: true, username: true },
    })

    if (!user) {
      return false
    }

    // Check manual override first
    if (user.moderator_override !== null) {
      return user.moderator_override === true
    }

    // Auto-detect from Kick moderators list
    try {
      const moderators = await fetchKickModerators()
      const kickUserIdStr = auth.kickUserId.toString()
      const usernameLower = user.username.toLowerCase()

      // Check by user_id or username
      return moderators.has(kickUserIdStr) || moderators.has(usernameLower)
    } catch (error) {
      console.error('[Auth] Error in auto-detection:', error)
      return false
    }
  } catch (error) {
    console.error('Error checking moderator status:', error)
    return false
  }
}

/**
 * Check if user can view payouts (admin or moderator)
 */
export async function canViewPayouts(request: Request): Promise<boolean> {
  const admin = await isAdmin(request)
  if (admin) {
    return true
  }

  return await isModerator(request)
}
