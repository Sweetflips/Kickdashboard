import { db } from './db';
import crypto from 'crypto'
import { getKickUserCredentials } from './kick-oauth-creds'

const KICK_API_BASE = 'https://api.kick.com/public/v1'
const KICK_OAUTH_BASE = 'https://id.kick.com'

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

async function refreshTokenForUser(kickUserId: bigint): Promise<string | null> {
  try {
    const user = await (db as any).user.findUnique({
      where: { kick_user_id: kickUserId },
      select: {
        refresh_token_encrypted: true,
      },
    })

    if (!user?.refresh_token_encrypted) {
      return null
    }

    const { decryptToken, encryptToken } = await import('./encryption')
    const refreshToken = decryptToken(user.refresh_token_encrypted)

    const { clientId, clientSecret } = getKickUserCredentials()
    const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://www.kickdashboard.com').replace(/\/$/, '')
    const redirectUri = process.env.KICK_REDIRECT_URI || `${APP_URL}/api/auth/callback`

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      redirect_uri: redirectUri,
    })

    const response = await fetch(`${KICK_OAUTH_BASE}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    if (!response.ok) {
      return null
    }

    const tokenData = await response.json()

    if (!tokenData.access_token) {
      return null
    }

    // Update tokens in database
    try {
      const encryptedAccessToken = encryptToken(tokenData.access_token)
      const encryptedRefreshToken = tokenData.refresh_token ? encryptToken(tokenData.refresh_token) : null

      await (db as any).user.update({
        where: { kick_user_id: kickUserId },
        data: {
          access_token_hash: hashToken(tokenData.access_token),
          refresh_token_hash: tokenData.refresh_token ? hashToken(tokenData.refresh_token) : undefined,
          access_token_encrypted: encryptedAccessToken,
          refresh_token_encrypted: encryptedRefreshToken || undefined,
          updated_at: new Date(),
        },
      })
    } catch (dbError) {
      console.error('Failed to update tokens in database:', dbError)
    }

    return tokenData.access_token
  } catch (error) {
    console.error('Error refreshing token:', error)
    return null
  }
}

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

    // If token expired (401), try to refresh it
    if (response.status === 401) {
      // Find user by token hash to get kickUserId for refresh
      const tokenHash = hashToken(accessToken)
      let user = await (db as any).user.findFirst({
        where: { access_token_hash: tokenHash },
        select: { kick_user_id: true },
      })

      // Fallback: if token hash lookup fails, try to get kick_user_id from cookie
      // This handles cases where token was refreshed but old hash is no longer in DB
      if (!user) {
        const cookieHeader = request.headers.get('cookie')
        if (cookieHeader) {
          const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
            const [key, value] = cookie.trim().split('=')
            if (key && value) {
              acc[key] = decodeURIComponent(value)
            }
            return acc
          }, {} as Record<string, string>)

          const kickUserIdFromCookie = cookies['kick_user_id']
          if (kickUserIdFromCookie) {
            try {
              const kickUserId = BigInt(kickUserIdFromCookie)
              // Verify user exists in database
              const dbUser = await (db as any).user.findUnique({
                where: { kick_user_id: kickUserId },
                select: { kick_user_id: true },
              })
              if (dbUser) {
                user = { kick_user_id: dbUser.kick_user_id }
              }
            } catch {
              // Invalid kick_user_id format, continue with null user
            }
          }
        }
      }

      if (user) {
        const newToken = await refreshTokenForUser(user.kick_user_id)
        if (newToken) {
          // Retry with new token
          const retryResponse = await fetch(`${KICK_API_BASE}/users`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${newToken}`,
              'Accept': 'application/json',
            },
          })

          if (retryResponse.ok) {
            const apiResponse = await retryResponse.json()
            const userDataArray = apiResponse.data || []

            if (Array.isArray(userDataArray) && userDataArray.length > 0) {
              const userData = userDataArray[0]
              const kickUserId = BigInt(userData.user_id)

              const dbUser = await (db as any).user.findUnique({
                where: { kick_user_id: kickUserId },
                select: { id: true },
              })

              if (dbUser) {
                return {
                  kickUserId,
                  userId: dbUser.id,
                }
              }
            }
          }
        }
      }

      return null
    }

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
    const user = await (db as any).user.findUnique({
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

    const user = await (db as any).user.findUnique({
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

    const user = await (db as any).user.findUnique({
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
