import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import crypto from 'crypto'

const KICK_CLIENT_ID = process.env.KICK_CLIENT_ID!
const KICK_CLIENT_SECRET = process.env.KICK_CLIENT_SECRET!
const KICK_OAUTH_BASE = 'https://id.kick.com'

if (!KICK_CLIENT_ID || !KICK_CLIENT_SECRET) {
    throw new Error('KICK_CLIENT_ID and KICK_CLIENT_SECRET must be set in environment variables')
}

function hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex')
}

/**
 * Build redirect URI from request headers (proxy-aware)
 * Prefers x-forwarded-proto/x-forwarded-host, falls back to host header, then env var
 * This must match the redirect URI used during initial OAuth authorization
 */
function buildRedirectUri(request: Request): string {
    const headers = request.headers
    const forwardedHost = headers.get('x-forwarded-host')
    const forwardedProto = headers.get('x-forwarded-proto')
    const host = headers.get('host') || ''

    const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1')

    // Check for explicit redirect URI override in environment (highest priority)
    // This ensures consistency between auth and refresh
    const explicitRedirectUri = process.env.KICK_REDIRECT_URI
    if (explicitRedirectUri) {
        return explicitRedirectUri
    }

    // Use consistent APP_URL from env (most reliable for production)
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://www.sweetflipsrewards.com'
    const cleanAppUrl = APP_URL.replace(/\/$/, '')

    // In production, always use the env var URL to ensure consistency
    // Only use dynamic headers for localhost development
    if (!host.includes('localhost') && !host.includes('127.0.0.1')) {
        return `${cleanAppUrl}/api/auth/callback`
    }

    // For localhost, use dynamic headers
    // Prefer forwarded headers if present (proxy/reverse proxy)
    if (forwardedHost) {
        const proto = forwardedProto || 'https'
        // Remove port if present (Kick OAuth doesn't like ports in redirect URIs)
        const cleanHost = forwardedHost.split(':')[0]
        return `${proto}://${cleanHost}/api/auth/callback`
    }

    // Fallback to host header for localhost
    if (host) {
        const proto = isLocalhost ? 'http' : 'https'
        // Remove port if present (Kick OAuth doesn't like ports in redirect URIs)
        const cleanHost = host.split(':')[0]
        return `${proto}://${cleanHost}/api/auth/callback`
    }

    // Final fallback
    return `${cleanAppUrl}/api/auth/callback`
}

/**
 * Refresh access token using refresh token
 * POST /api/auth/refresh
 * Body: { refresh_token: string, kick_user_id?: string }
 */
export async function POST(request: Request) {
    try {
        const body = await request.json()
        const refreshToken = body.refresh_token
        const kickUserId = body.kick_user_id ? BigInt(body.kick_user_id) : null

        if (!refreshToken) {
            return NextResponse.json(
                { error: 'Refresh token is required' },
                { status: 400 }
            )
        }

        // If kick_user_id is provided, verify refresh token hash matches database
        if (kickUserId) {
            const refreshTokenHash = hashToken(refreshToken)
            const user = await db.user.findUnique({
                where: { kick_user_id: kickUserId },
                select: { refresh_token_hash: true },
            })

            if (!user || user.refresh_token_hash !== refreshTokenHash) {
                return NextResponse.json(
                    { error: 'Invalid refresh token' },
                    { status: 401 }
                )
            }
        }

        // Build redirect URI (must match the one used during authorization)
        const redirectUri = buildRedirectUri(request)

        // Log redirect URI for debugging (first 50 chars only for security)
        console.log(`🔄 Token refresh attempt - redirect URI: ${redirectUri.substring(0, 50)}...`)

        // Exchange refresh token for new access token
        const params = new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: KICK_CLIENT_ID,
            client_secret: KICK_CLIENT_SECRET,
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
            const errorText = await response.text()
            let errorDetails: any = { message: errorText }

            // Try to parse error response for better error messages
            try {
                const errorJson = JSON.parse(errorText)
                errorDetails = errorJson
            } catch {
                // Keep as text if not JSON
            }

            // Log detailed error information for debugging (only for non-401 errors or if verbose logging enabled)
            if (response.status !== 401 || process.env.VERBOSE_TOKEN_REFRESH_LOGS === 'true') {
                console.error('❌ Token refresh failed:', {
                    status: response.status,
                    error: errorDetails,
                    redirectUri: redirectUri.substring(0, 50) + '...',
                    hasRefreshToken: !!refreshToken,
                    refreshTokenLength: refreshToken?.length || 0,
                })
            } else {
                // For expected 401s (expired tokens), just log a warning
                console.warn(`⚠️ Token refresh failed: Refresh token expired or invalid (401)`)
            }

            // If it's an invalid_grant error, the refresh token is likely expired/revoked
            if (response.status === 401 && errorDetails.error === 'invalid_grant') {
                return NextResponse.json(
                    {
                        error: 'Refresh token expired or invalid',
                        details: 'The refresh token has expired, been revoked, or does not match the redirect URI used during authorization. Please log in again.',
                        code: 'REFRESH_TOKEN_INVALID'
                    },
                    { status: 401 }
                )
            }

            return NextResponse.json(
                { error: 'Failed to refresh token', details: errorDetails },
                { status: response.status }
            )
        }

        const tokenData = await response.json()

        // Update tokens in database if kick_user_id is provided
        if (kickUserId && tokenData.access_token) {
            try {
                await db.user.update({
                    where: { kick_user_id: kickUserId },
                    data: {
                        access_token_hash: hashToken(tokenData.access_token),
                        refresh_token_hash: tokenData.refresh_token ? hashToken(tokenData.refresh_token) : undefined,
                        updated_at: new Date(),
                    },
                })
            } catch (dbError) {
                console.error('Failed to update tokens in database:', dbError)
                // Continue even if DB update fails
            }
        }

        return NextResponse.json({
            success: true,
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token || refreshToken, // Use new refresh token if provided, otherwise keep old one
            expires_in: tokenData.expires_in,
        })
    } catch (error) {
        console.error('Error refreshing token:', error)
        return NextResponse.json(
            { error: 'Failed to refresh token', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
