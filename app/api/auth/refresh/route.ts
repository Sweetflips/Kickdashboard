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
 */
function buildRedirectUri(request: Request): string {
    const headers = request.headers
    const forwardedHost = headers.get('x-forwarded-host')
    const forwardedProto = headers.get('x-forwarded-proto')
    const host = headers.get('host') || ''

    const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1')

    // Prefer forwarded headers if present (proxy/reverse proxy)
    if (forwardedHost) {
        const proto = forwardedProto || 'https'
        return `${proto}://${forwardedHost}/api/auth/callback`
    }

    // Fallback to host header
    if (host) {
        const proto = isLocalhost ? 'http' : 'https'
        return `${proto}://${host}/api/auth/callback`
    }

    // Final fallback to env var
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.sweetflipsrewards.com'
    return `${APP_URL}/api/auth/callback`
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
            console.error('❌ Token refresh failed:', response.status, errorText)
            return NextResponse.json(
                { error: 'Failed to refresh token', details: errorText },
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
