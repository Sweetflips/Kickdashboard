/**
 * Cookie utility functions for authentication tokens
 * Cookies expire after 3 months (90 days)
 */

const THREE_MONTHS_IN_SECONDS = 90 * 24 * 60 * 60 // 7,776,000 seconds

/**
 * Get a cookie value by name
 */
export function getCookie(name: string): string | null {
    if (typeof document === 'undefined') return null
    const value = `; ${document.cookie}`
    const parts = value.split(`; ${name}=`)
    if (parts.length === 2) return parts.pop()?.split(';').shift() || null
    return null
}

/**
 * Set a cookie with 3-month expiration
 */
export function setCookie(name: string, value: string, options?: {
    httpOnly?: boolean
    secure?: boolean
    sameSite?: 'strict' | 'lax' | 'none'
    path?: string
}) {
    if (typeof document === 'undefined') return

    const expiresDate = new Date(Date.now() + THREE_MONTHS_IN_SECONDS * 1000)
    const secure = options?.secure ?? (window.location.protocol === 'https:')
    const sameSite = options?.sameSite ?? 'lax'
    const path = options?.path ?? '/'

    let cookieString = `${name}=${value}; expires=${expiresDate.toUTCString()}; path=${path}; SameSite=${sameSite}`

    if (secure) {
        cookieString += '; Secure'
    }

    document.cookie = cookieString
}

/**
 * Delete a cookie
 */
export function deleteCookie(name: string, path: string = '/') {
    if (typeof document === 'undefined') return
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${path};`
}

/**
 * Get authentication token from cookies or localStorage (backward compatibility)
 */
export function getAccessToken(): string | null {
    if (typeof window === 'undefined') return null
    return getCookie('kick_access_token') || localStorage.getItem('kick_access_token')
}

/**
 * Get refresh token from cookies or localStorage (backward compatibility)
 */
export function getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null
    return getCookie('kick_refresh_token') || localStorage.getItem('kick_refresh_token')
}

/**
 * Set authentication tokens in both cookies and localStorage (for backward compatibility)
 */
export function setAuthTokens(accessToken: string, refreshToken?: string) {
    if (typeof window === 'undefined') return

    // Set cookies with 3-month expiration
    setCookie('kick_access_token', accessToken)
    if (refreshToken) {
        setCookie('kick_refresh_token', refreshToken)
    }

    // Also update localStorage for backward compatibility
    localStorage.setItem('kick_access_token', accessToken)
    if (refreshToken) {
        localStorage.setItem('kick_refresh_token', refreshToken)
    }
}

/**
 * Clear authentication tokens from both cookies and localStorage
 */
export function clearAuthTokens() {
    if (typeof window === 'undefined') return

    deleteCookie('kick_access_token')
    deleteCookie('kick_refresh_token')
    localStorage.removeItem('kick_access_token')
    localStorage.removeItem('kick_refresh_token')
}










