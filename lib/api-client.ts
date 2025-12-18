/**
 * Authenticated API client with automatic token refresh and retry logic
 *
 * This utility ensures that API calls always use fresh tokens and automatically
 * refreshes expired tokens without requiring user intervention.
 */

import { getAccessToken, getRefreshToken, setAuthTokens, clearAuthTokens } from './cookies'
import { getClientAccessToken } from './auth-client'

/**
 * Custom error for API failures
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: any
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Options for authenticated fetch
 */
export interface AuthenticatedFetchOptions extends RequestInit {
  /**
   * Whether to retry on 401 errors (default: true)
   */
  retryOn401?: boolean

  /**
   * Maximum number of retry attempts (default: 1)
   */
  maxRetries?: number

  /**
   * Whether to include credentials (cookies) in the request (default: true)
   */
  includeCredentials?: boolean
}

/**
 * Refresh the access token using the refresh token
 */
async function refreshAccessToken(kickUserId?: string | number): Promise<{ access_token: string; refresh_token: string } | null> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) {
    return null
  }

  try {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        refresh_token: refreshToken,
        kick_user_id: kickUserId,
      }),
    })

    if (!response.ok) {
      // Refresh failed - user needs to re-authenticate
      if (response.status === 401) {
        clearAuthTokens()
        throw new ApiError('Token refresh failed. Please log in again.', 401)
      }
      throw new ApiError('Failed to refresh token', response.status)
    }

    const data = await response.json()
    if (data.access_token) {
      // Update tokens in both cookies and localStorage
      setAuthTokens(data.access_token, data.refresh_token || refreshToken)
      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token || refreshToken,
      }
    }

    return null
  } catch (error) {
    if (error instanceof ApiError) {
      throw error
    }
    throw new ApiError('Token refresh failed', 500, error)
  }
}

/**
 * Authenticated fetch wrapper that automatically handles token refresh
 *
 * @param url - The URL to fetch
 * @param options - Fetch options (extends RequestInit)
 * @param kickUserId - Optional kick_user_id for token refresh
 * @returns Promise<Response>
 */
export async function authenticatedFetch(
  url: string,
  options: AuthenticatedFetchOptions = {},
  kickUserId?: string | number
): Promise<Response> {
  const {
    retryOn401 = true,
    maxRetries = 1,
    includeCredentials = true,
    headers = {},
    ...fetchOptions
  } = options

  // Get current access token
  let accessToken = getClientAccessToken()

  if (!accessToken) {
    throw new ApiError('No access token available', 401)
  }

  // Prepare headers with authorization
  const requestHeaders = new Headers(headers)
  requestHeaders.set('Authorization', `Bearer ${accessToken}`)

  // Make initial request
  let response = await fetch(url, {
    ...fetchOptions,
    headers: requestHeaders,
    credentials: includeCredentials ? 'include' : 'omit',
  })

  // Handle 401 errors with automatic retry
  if (response.status === 401 && retryOn401 && maxRetries > 0) {
    console.log('Token expired, attempting refresh...')

    try {
      const newTokens = await refreshAccessToken(kickUserId)

      if (newTokens) {
        // Retry request with new token
        const retryHeaders = new Headers(headers)
        retryHeaders.set('Authorization', `Bearer ${newTokens.access_token}`)

        response = await fetch(url, {
          ...fetchOptions,
          headers: retryHeaders,
          credentials: includeCredentials ? 'include' : 'omit',
        })
      } else {
        // Refresh failed
        throw new ApiError('Token refresh failed', 401)
      }
    } catch (error) {
      if (error instanceof ApiError) {
        throw error
      }
      // If refresh fails, clear tokens and throw
      clearAuthTokens()
      throw new ApiError('Authentication failed. Please log in again.', 401)
    }
  }

  return response
}

/**
 * Authenticated fetch that automatically parses JSON response
 *
 * @param url - The URL to fetch
 * @param options - Fetch options
 * @param kickUserId - Optional kick_user_id for token refresh
 * @returns Promise<T> - Parsed JSON response
 */
export async function authenticatedFetchJson<T = any>(
  url: string,
  options: AuthenticatedFetchOptions = {},
  kickUserId?: string | number
): Promise<T> {
  const response = await authenticatedFetch(url, options, kickUserId)

  if (!response.ok) {
    let errorData: any = null
    try {
      errorData = await response.json()
    } catch {
      // Ignore JSON parse errors
    }
    throw new ApiError(
      errorData?.error || `Request failed with status ${response.status}`,
      response.status,
      errorData
    )
  }

  return response.json()
}

/**
 * Helper to get kick_user_id from cookies (for use in authenticated fetch)
 */
export function getKickUserIdFromCookie(): string | null {
  if (typeof document === 'undefined') return null

  const cookies = document.cookie.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=')
    if (key && value) {
      acc[key] = decodeURIComponent(value)
    }
    return acc
  }, {} as Record<string, string>)

  return cookies['kick_user_id'] || null
}
