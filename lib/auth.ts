import { db } from '@/lib/db';

const KICK_API_BASE = 'https://api.kick.com/public/v1'

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
 * Check if user is a moderator.
 *
 * Mod auto-detection is intentionally disabled.
 * Default behavior: NOT a moderator unless explicitly enabled.
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

    // Default: NOT a moderator unless explicitly enabled.
    return user.moderator_override === true
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
