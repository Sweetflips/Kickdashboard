import { db } from '@/lib/db'
import { encryptToken, hashToken } from '@/lib/encryption'
import { getKickBotCredentials } from '@/lib/kick-oauth-creds'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const KICK_OAUTH_BASE = 'https://id.kick.com'
const KICK_API_BASE = 'https://api.kick.com/public/v1'
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.kickdashboard.com').replace(/\/$/, '')

/**
 * Build redirect URI for bot callback from the request
 * Must match exactly what was sent to Kick during authorization
 */
function buildBotRedirectUri(request: Request): string {
    // Check for explicit redirect URI override in environment (highest priority)
    const explicitRedirectUri = process.env.KICK_BOT_REDIRECT_URI
    if (explicitRedirectUri) {
        return explicitRedirectUri
    }

    // Build from request URL to ensure exact match with what Kick redirected to
    const url = new URL(request.url)
    const protocol = url.protocol
    const host = url.host
    return `${protocol}//${host}/api/auth/sweetflipsbot/callback`
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const code = searchParams.get('code')
        const error = searchParams.get('error')

        const host = request.headers.get('host') || ''
        const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1')
        const baseUrl = isLocalhost ? `http://${host}` : APP_URL
        const errorRedirect = isLocalhost ? `http://${host}` : APP_URL

        if (error) {
            return NextResponse.redirect(`${errorRedirect}/?error=${encodeURIComponent(error)}&bot_auth=true`)
        }

        if (!code) {
            return NextResponse.redirect(`${errorRedirect}/?error=${encodeURIComponent('No authorization code received')}&bot_auth=true`)
        }

        // Get code_verifier from cookie (set during auth flow)
        const cookieStore = await cookies()
        const codeVerifier = cookieStore.get('pkce_code_verifier')?.value

        if (!codeVerifier) {
            return NextResponse.redirect(`${errorRedirect}/?error=${encodeURIComponent('PKCE code verifier not found. Please try authenticating again at /api/auth?action=authorize&bot=1')}&bot_auth=true`)
        }

        // Always use bot credentials for this callback
        const { clientId, clientSecret } = getKickBotCredentials()
        const redirectUri = buildBotRedirectUri(request)

        // Exchange code for token using form-urlencoded
        const params = new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: clientId,
            client_secret: clientSecret,
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
            return NextResponse.redirect(`${errorRedirect}/?error=${encodeURIComponent(`Failed to exchange token: ${errorText}`)}&bot_auth=true`)
        }

        const tokenData = await tokenResponse.json()

        // Fetch user data from Kick API to get kick_user_id
        let kickUserId: bigint | null = null
        let username: string = 'sweetflipsbot'

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
                    kickUserId = BigInt(userData.user_id)
                    username = userData.name || userData.username || 'sweetflipsbot'
                    const email = userData.email || null
                    const profilePictureUrl = userData.profile_picture && typeof userData.profile_picture === 'string' && userData.profile_picture.trim() !== ''
                        ? userData.profile_picture.trim()
                        : null

                    // Encrypt tokens for storage
                    let encryptedAccessToken: string | null = null
                    let encryptedRefreshToken: string | null = null
                    try {
                        if (tokenData.access_token) {
                            encryptedAccessToken = encryptToken(tokenData.access_token)
                        }
                        if (tokenData.refresh_token) {
                            encryptedRefreshToken = encryptToken(tokenData.refresh_token)
                        }
                    } catch (encryptError) {
                        console.error('❌ Could not encrypt tokens:', encryptError instanceof Error ? encryptError.message : 'Unknown error')
                        return NextResponse.redirect(`${errorRedirect}/?error=${encodeURIComponent('Failed to encrypt tokens')}&bot_auth=true`)
                    }

                    // Save or update bot user in database
                    const prisma = db as any
                    await prisma.user.upsert({
                        where: { kick_user_id: kickUserId },
                        update: {
                            username,
                            email,
                            profile_picture_url: profilePictureUrl,
                            access_token_hash: tokenData.access_token ? hashToken(tokenData.access_token) : null,
                            refresh_token_hash: tokenData.refresh_token ? hashToken(tokenData.refresh_token) : null,
                            access_token_encrypted: encryptedAccessToken,
                            refresh_token_encrypted: encryptedRefreshToken,
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
                            access_token_encrypted: encryptedAccessToken,
                            refresh_token_encrypted: encryptedRefreshToken,
                            last_login_at: new Date(),
                        },
                    })

                    console.log(`✅ Bot authorization successful: ${username} (ID: ${kickUserId})`)
                } else {
                    console.warn('⚠️ Could not fetch user data from Kick API')
                    return NextResponse.redirect(`${errorRedirect}/?error=${encodeURIComponent('Could not fetch user data')}&bot_auth=true`)
                }
            } else {
                const errorText = await userResponse.text()
                console.warn(`⚠️ Failed to fetch user data from Kick API: ${userResponse.status} ${errorText}`)
                return NextResponse.redirect(`${errorRedirect}/?error=${encodeURIComponent(`Failed to fetch user data: ${errorText}`)}&bot_auth=true`)
            }
        } catch (userError) {
            console.error('❌ Error saving bot user to database:', userError)
            return NextResponse.redirect(`${errorRedirect}/?error=${encodeURIComponent('Failed to save bot user')}&bot_auth=true`)
        }

        // Clear PKCE cookie
        const response = NextResponse.redirect(`${baseUrl}/?bot_auth_success=true&username=${encodeURIComponent(username)}`)
        response.cookies.delete('pkce_code_verifier')

        return response
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error('❌ Bot callback error:', errorMessage)
        const host = request.headers.get('host') || ''
        const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1')
        const errorRedirect = isLocalhost ? `http://${host}` : APP_URL
        return NextResponse.redirect(`${errorRedirect}/?error=${encodeURIComponent(errorMessage)}&bot_auth=true`)
    }
}
