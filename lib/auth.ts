import { db } from '@/lib/db'

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
