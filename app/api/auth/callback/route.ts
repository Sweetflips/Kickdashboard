import { db } from '@/lib/db'
import crypto from 'crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const KICK_CLIENT_ID = process.env.KICK_CLIENT_ID!
const KICK_CLIENT_SECRET = process.env.KICK_CLIENT_SECRET!
const KICK_OAUTH_BASE = 'https://id.kick.com'
const KICK_API_BASE = 'https://api.kick.com/public/v1'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.sweetflipsrewards.com'

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
    return `${APP_URL}/api/auth/callback`
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const code = searchParams.get('code')
        const state = searchParams.get('state')
        const error = searchParams.get('error')

        const redirectUri = buildRedirectUri(request)
        const host = request.headers.get('host') || ''
        const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1')

        const baseUrl = isLocalhost ? `http://${host}` : APP_URL
        const errorRedirect = isLocalhost ? `http://${host}` : APP_URL

        if (error) {
            return NextResponse.redirect(`${errorRedirect}/?error=${encodeURIComponent(error)}`)
        }

        if (!code) {
            return NextResponse.redirect(`${errorRedirect}/?error=${encodeURIComponent('No authorization code received')}`)
        }

        // Get code_verifier from cookie
        const cookieStore = await cookies()
        const codeVerifier = cookieStore.get('pkce_code_verifier')?.value

        if (!codeVerifier) {
            return NextResponse.redirect(`${errorRedirect}/?error=${encodeURIComponent('PKCE code verifier not found. Please try authenticating again.')}`)
        }

        // Exchange code for token using form-urlencoded
        const params = new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: KICK_CLIENT_ID,
            client_secret: KICK_CLIENT_SECRET,
            code,
            redirect_uri: redirectUri,
            code_verifier: codeVerifier,
        })

        const tokenResponse = await fetch(`${KICK_OAUTH_BASE}/oauth/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
        })

        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text()
            return NextResponse.redirect(`${errorRedirect}/?error=${encodeURIComponent(`Failed to exchange token: ${errorText}`)}`)
        }

        const tokenData = await tokenResponse.json()

        // Fetch user data from Kick API
        try {
            const userResponse = await fetch(`${KICK_API_BASE}/users`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${tokenData.access_token}`,
                    'Accept': 'application/json',
                },
            })

            if (userResponse.ok) {
                const userApiResponse = await userResponse.json()
                const userDataArray = userApiResponse.data || []

                if (Array.isArray(userDataArray) && userDataArray.length > 0) {
                    const userData = userDataArray[0]
                    const kickUserId = BigInt(userData.user_id)
                    const username = userData.name || userData.username || 'Unknown'
                    const email = userData.email || null
                    const profilePictureUrl = userData.profile_picture && typeof userData.profile_picture === 'string' && userData.profile_picture.trim() !== ''
                        ? userData.profile_picture.trim()
                        : null

                    // Save or update user in database
                    await db.user.upsert({
                        where: { kick_user_id: kickUserId },
                        update: {
                            username,
                            email,
                            profile_picture_url: profilePictureUrl,
                            access_token_hash: tokenData.access_token ? hashToken(tokenData.access_token) : null,
                            refresh_token_hash: tokenData.refresh_token ? hashToken(tokenData.refresh_token) : null,
                            last_login_at: new Date(),
                            updated_at: new Date(),
                        },
                        create: {
                            kick_user_id: kickUserId,
                            username,
                            email,
                            profile_picture_url: profilePictureUrl,
                            access_token_hash: tokenData.access_token ? hashToken(tokenData.access_token) : null,
                            refresh_token_hash: tokenData.refresh_token ? hashToken(tokenData.refresh_token) : null,
                            last_login_at: new Date(),
                        },
                    })

                    console.log(`✅ User saved to database: ${username} (ID: ${kickUserId})`)
                } else {
                    console.warn('⚠️ Could not fetch user data to save to database')
                }
            } else {
                console.warn('⚠️ Failed to fetch user data from Kick API')
            }
        } catch (userError) {
            console.error('❌ Error saving user to database:', userError)
            // Continue with redirect even if user save fails
        }

        // Clear PKCE cookie and redirect to dashboard
        const response = NextResponse.redirect(`${baseUrl}/?auth_success=true&access_token=${encodeURIComponent(tokenData.access_token)}&refresh_token=${encodeURIComponent(tokenData.refresh_token || '')}`)
        response.cookies.delete('pkce_code_verifier')

        return response
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        const host = request.headers.get('host') || ''
        const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1')
        const errorRedirect = isLocalhost ? `http://${host}` : ''
        return NextResponse.redirect(`${errorRedirect}/?error=${encodeURIComponent(errorMessage)}`)
    }
}
