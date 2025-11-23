/**
 * Token refresh utility for Kick authentication
 * Automatically refreshes access tokens when they expire
 */

import { getAccessToken, getRefreshToken, setAuthTokens } from './cookies'

export interface TokenRefreshResult {
    access_token: string
    refresh_token: string
    success: boolean
    error?: string
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken?: string, kickUserId?: string): Promise<TokenRefreshResult | null> {
    try {
        // Use provided refresh token or get from cookies/localStorage
        const tokenToUse = refreshToken || getRefreshToken()
        if (!tokenToUse) {
            return {
                access_token: '',
                refresh_token: '',
                success: false,
                error: 'No refresh token available',
            }
        }

        const response = await fetch('/api/auth/refresh', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                refresh_token: tokenToUse,
                kick_user_id: kickUserId,
            }),
        })

        if (!response.ok) {
            const errorData = await response.json()

            // Only log refresh failures (these are the ones we care about)
            if (response.status === 401) {
                console.warn(`⚠️ Token refresh failed: Refresh token expired or invalid (401)`)
            } else {
                console.error('Token refresh failed:', errorData)
            }

            return {
                access_token: '',
                refresh_token: tokenToUse,
                success: false,
                error: errorData.error || 'Failed to refresh token',
            }
        }

        const data = await response.json()

        // Update tokens in both cookies and localStorage (for backward compatibility)
        if (typeof window !== 'undefined') {
            setAuthTokens(data.access_token, data.refresh_token || tokenToUse)
        }

        return {
            access_token: data.access_token,
            refresh_token: data.refresh_token || tokenToUse,
            success: true,
        }
    } catch (error) {
        console.error('Error refreshing token:', error)
        return {
            access_token: '',
            refresh_token: refreshToken,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }
    }
}

/**
 * Fetch with automatic token refresh on 401 errors
 */
export async function fetchWithTokenRefresh(
    url: string,
    options: RequestInit = {},
    kickUserId?: string
): Promise<Response> {
    const accessToken = typeof window !== 'undefined' ? localStorage.getItem('kick_access_token') : null
    const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('kick_refresh_token') : null

    if (!accessToken) {
        throw new Error('No access token available')
    }

    // Make initial request
    const response = await fetch(url, {
        ...options,
        headers: {
            ...options.headers,
            'Authorization': `Bearer ${accessToken}`,
        },
    })

    // If 401 and we have a refresh token, try to refresh
    if (response.status === 401 && refreshToken && typeof window !== 'undefined') {
        console.log('Token expired, attempting refresh...')
        const refreshResult = await refreshAccessToken(refreshToken, kickUserId)

        if (refreshResult?.success && refreshResult.access_token) {
            // Retry request with new token
            return fetch(url, {
                ...options,
                headers: {
                    ...options.headers,
                    'Authorization': `Bearer ${refreshResult.access_token}`,
                },
            })
        } else {
            // Refresh failed, user needs to re-authenticate
            console.warn('⚠️ Token refresh failed - user needs to re-authenticate')
            const { clearAuthTokens } = await import('./cookies')
            clearAuthTokens()
            throw new Error('Token refresh failed. Please log in again.')
        }
    }

    return response
}
