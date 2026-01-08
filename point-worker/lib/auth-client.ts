/**
 * Client-side auth helpers.
 *
 * The app migrated to cookie-based auth (set by `/api/auth/callback`), but many
 * pages still read `localStorage`. This module keeps backward compatibility by
 * hydrating localStorage from cookies once, then returning the token.
 */
import { getAccessToken, getRefreshToken, setAuthTokens } from '@/lib/cookies'

/**
 * Ensure localStorage has tokens if cookies do (best-effort).
 * Safe to call multiple times.
 */
export function hydrateLocalStorageFromCookies(): void {
  if (typeof window === 'undefined') return

  const cookieAccess = getAccessToken()
  if (!cookieAccess) return

  const lsAccess = localStorage.getItem('kick_access_token')
  if (lsAccess && lsAccess.trim().length > 0) return

  const cookieRefresh = getRefreshToken() || undefined
  try {
    setAuthTokens(cookieAccess, cookieRefresh)
  } catch {
    // Ignore storage failures (Safari private mode, etc.)
  }
}

/**
 * Preferred way to get an access token in client components.
 * - Cookies first
 * - Falls back to localStorage
 * - Hydrates localStorage from cookies if needed
 */
export function getClientAccessToken(): string | null {
  hydrateLocalStorageFromCookies()
  return getAccessToken()
}

export function getClientRefreshToken(): string | null {
  hydrateLocalStorageFromCookies()
  return getRefreshToken()
}
