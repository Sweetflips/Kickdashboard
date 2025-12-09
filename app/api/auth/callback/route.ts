import { db } from '@/lib/db'
import crypto from 'crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { encryptToken, hashToken } from '@/lib/encryption'

export const dynamic = 'force-dynamic'

const KICK_OAUTH_BASE = 'https://id.kick.com'
const KICK_API_BASE = 'https://api.kick.com/public/v1'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://kickdashboard.com'

// Get credentials at runtime to avoid startup crashes
function getKickCredentials() {
    const clientId = process.env.KICK_CLIENT_ID
    const clientSecret = process.env.KICK_CLIENT_SECRET
    if (!clientId || !clientSecret) {
        throw new Error('KICK_CLIENT_ID and KICK_CLIENT_SECRET must be set')
    }
    return { clientId, clientSecret }
}

/**
 * Extract IP address from request headers
 * Handles x-forwarded-for (proxy) and direct connection
 */
function extractIpAddress(request: Request): string | null {
    const headers = request.headers
    // Check x-forwarded-for first (for proxies/load balancers)
    const forwardedFor = headers.get('x-forwarded-for')
    if (forwardedFor) {
        // x-forwarded-for can contain multiple IPs, take the first one
        return forwardedFor.split(',')[0].trim()
    }
    // Fallback to x-real-ip (some proxies use this)
    const realIp = headers.get('x-real-ip')
    if (realIp) {
        return realIp.trim()
    }
    // Note: In Next.js edge/serverless, we can't directly access socket.remoteAddress
    // So we rely on headers only
    return null
}

/**
 * Build redirect URI from request headers (proxy-aware)
 * Ensures consistency between auth and refresh endpoints
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
        return `${proto}://${forwardedHost}/api/auth/callback`
    }

    // Fallback to host header for localhost
    if (host) {
        const proto = isLocalhost ? 'http' : 'https'
        return `${proto}://${host}/api/auth/callback`
    }

    // Final fallback
    return `${cleanAppUrl}/api/auth/callback`
}

export async function GET(request: Request) {
    try {
        const { clientId, clientSecret } = getKickCredentials()
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

                    // Extract IP address and User-Agent from request headers
                    const ipAddress = extractIpAddress(request)
                    const userAgent = request.headers.get('user-agent') || null
                    const referrer = request.headers.get('referer') || request.headers.get('referrer') || null
                    
                    // Extract referral code from URL parameter
                    const referralCode = searchParams.get('ref')?.toUpperCase().trim() || null

                    // Check if user already exists to determine if this is a signup
                    const existingUser = await db.user.findUnique({
                        where: { kick_user_id: kickUserId },
                        select: { id: true, signup_ip_address: true },
                    })
                    const isNewSignup = !existingUser

                    // Fetch channel data for additional profile information (bio, social links)
                    let bio: string | null = null
                    let emailVerifiedAt: Date | null = null
                    let instagramUrl: string | null = null
                    let twitterUrl: string | null = null

                    try {
                        // Fetch channel data to get bio and social links
                        const channelResponse = await fetch(`https://kick.com/api/v2/channels/${username.toLowerCase()}`, {
                            headers: {
                                'Accept': 'application/json',
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                            },
                        })

                        if (channelResponse.ok) {
                            const channelData = await channelResponse.json()
                            const channelUser = channelData.user || channelData

                            // Extract bio
                            if (channelUser.bio && typeof channelUser.bio === 'string') {
                                bio = channelUser.bio.trim() || null
                            }

                            // Extract email verification status
                            if (channelUser.email_verified_at) {
                                emailVerifiedAt = new Date(channelUser.email_verified_at)
                            }

                            // Extract social media links (for duplicate detection)
                            if (channelUser.instagram && typeof channelUser.instagram === 'string' && channelUser.instagram.trim()) {
                                instagramUrl = channelUser.instagram.trim()
                            }
                            if (channelUser.twitter && typeof channelUser.twitter === 'string' && channelUser.twitter.trim()) {
                                twitterUrl = channelUser.twitter.trim()
                            }
                        }
                    } catch (channelError) {
                        // Non-critical - continue even if channel data fetch fails
                        console.warn('⚠️ Could not fetch channel data for additional profile info:', channelError instanceof Error ? channelError.message : 'Unknown error')
                    }

                    // Encrypt tokens for storage (can be decrypted for API calls)
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
                        console.warn('⚠️ Could not encrypt tokens:', encryptError instanceof Error ? encryptError.message : 'Unknown error')
                    }

                    // Prepare update data (always update these fields)
                    const updateData: any = {
                        username,
                        email,
                        profile_picture_url: profilePictureUrl,
                        access_token_hash: tokenData.access_token ? hashToken(tokenData.access_token) : null,
                        refresh_token_hash: tokenData.refresh_token ? hashToken(tokenData.refresh_token) : null,
                        access_token_encrypted: encryptedAccessToken,
                        refresh_token_encrypted: encryptedRefreshToken,
                        last_login_at: new Date(),
                        last_ip_address: ipAddress,
                        last_user_agent: userAgent,
                        updated_at: new Date(),
                    }

                    // Update profile fields if available
                    if (bio !== null) updateData.bio = bio
                    if (emailVerifiedAt !== null) updateData.email_verified_at = emailVerifiedAt
                    if (instagramUrl !== null) updateData.instagram_url = instagramUrl
                    if (twitterUrl !== null) updateData.twitter_url = twitterUrl

                    // Prepare create data (includes signup tracking)
                    const createData: any = {
                        kick_user_id: kickUserId,
                        username,
                        email,
                        profile_picture_url: profilePictureUrl,
                        access_token_hash: tokenData.access_token ? hashToken(tokenData.access_token) : null,
                        refresh_token_hash: tokenData.refresh_token ? hashToken(tokenData.refresh_token) : null,
                        access_token_encrypted: encryptedAccessToken,
                        refresh_token_encrypted: encryptedRefreshToken,
                        last_login_at: new Date(),
                        last_ip_address: ipAddress,
                        last_user_agent: userAgent,
                        signup_ip_address: ipAddress,
                        signup_user_agent: userAgent,
                        signup_referrer: referrer,
                    }

                    // Add profile fields to create data
                    if (bio !== null) createData.bio = bio
                    if (emailVerifiedAt !== null) createData.email_verified_at = emailVerifiedAt
                    if (instagramUrl !== null) createData.instagram_url = instagramUrl
                    if (twitterUrl !== null) createData.twitter_url = twitterUrl

                    // Save or update user in database
                    const savedUser = await db.user.upsert({
                        where: { kick_user_id: kickUserId },
                        update: updateData,
                        create: createData,
                    })

                    // Handle referral if provided and this is a new signup
                    if (isNewSignup && referralCode) {
                        try {
                            // Find the referrer by username (referral code is uppercase username)
                            const referrer = await db.user.findFirst({
                                where: {
                                    username: {
                                        equals: referralCode,
                                        mode: 'insensitive',
                                    }
                                },
                                select: { id: true, username: true },
                            })

                            if (referrer && referrer.id !== savedUser.id) {
                                // Create referral relationship
                                await db.referral.create({
                                    data: {
                                        referrer_user_id: referrer.id,
                                        referee_user_id: savedUser.id,
                                        referral_code: referralCode,
                                    },
                                })
                                console.log(`✅ Referral created: ${referrer.username} -> ${username}`)
                            } else if (!referrer) {
                                console.warn(`⚠️ Referral code not found: ${referralCode}`)
                            } else {
                                console.warn(`⚠️ User cannot refer themselves`)
                            }
                        } catch (referralError) {
                            // Non-critical - log but don't fail auth
                            console.warn('⚠️ Could not create referral:', referralError instanceof Error ? referralError.message : 'Unknown error')
                        }
                    }

                    // Create or update user session for diagnostics
                    try {
                        // Infer client type from user agent
                        let clientType: string | null = null
                        if (userAgent) {
                            const ua = userAgent.toLowerCase()
                            if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone') || ua.includes('ipad')) {
                                clientType = 'mobile'
                            } else if (ua.includes('embedded') || ua.includes('iframe')) {
                                clientType = 'embedded'
                            } else {
                                clientType = 'web'
                            }
                        }

                        // Simple region detection based on IP (in production, use a geolocation service)
                        // For now, we'll store a hash of the IP and leave region/country null
                        // In production, you'd use a service like MaxMind GeoIP2 or Cloudflare's CF-IPCountry header
                        const ipHash = ipAddress ? hashToken(ipAddress) : null

                        // Find existing recent session for this user with same client type and IP hash (within last 24 hours)
                        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
                        const existingSession = await db.userSession.findFirst({
                            where: {
                                user_id: savedUser.id,
                                client_type: clientType,
                                ip_hash: ipHash,
                                last_seen_at: {
                                    gte: oneDayAgo,
                                },
                            },
                            orderBy: {
                                last_seen_at: 'desc',
                            },
                        })

                        if (existingSession) {
                            // Update existing session
                            await db.userSession.update({
                                where: { id: existingSession.id },
                                data: {
                                    last_seen_at: new Date(),
                                    updated_at: new Date(),
                                },
                            })
                        } else {
                            // Create new session
                            const sessionId = crypto.randomUUID()
                            await db.userSession.create({
                                data: {
                                    user_id: savedUser.id,
                                    session_id: sessionId,
                                    client_type: clientType,
                                    user_agent: userAgent,
                                    ip_hash: ipHash,
                                    last_seen_at: new Date(),
                                },
                            })
                        }
                    } catch (sessionError) {
                        // Non-critical - log but don't fail auth
                        console.warn('⚠️ Could not create/update user session:', sessionError instanceof Error ? sessionError.message : 'Unknown error')
                    }

                    console.log(`✅ User ${isNewSignup ? 'signed up' : 'logged in'}: ${username} (ID: ${kickUserId})`)
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

        // Clear PKCE cookie and set auth tokens in cookies with 3-month expiration
        const response = NextResponse.redirect(`${baseUrl}/?auth_success=true&access_token=${encodeURIComponent(tokenData.access_token)}&refresh_token=${encodeURIComponent(tokenData.refresh_token || '')}`)
        response.cookies.delete('pkce_code_verifier')

        // Set authentication tokens in cookies with 3-month expiration (90 days)
        const threeMonthsInSeconds = 90 * 24 * 60 * 60 // 7,776,000 seconds
        response.cookies.set('kick_access_token', tokenData.access_token, {
            httpOnly: false, // Needs to be accessible from client-side JavaScript
            secure: !isLocalhost,
            sameSite: 'lax',
            maxAge: threeMonthsInSeconds,
            path: '/',
        })

        if (tokenData.refresh_token) {
            response.cookies.set('kick_refresh_token', tokenData.refresh_token, {
                httpOnly: false, // Needs to be accessible from client-side JavaScript
                secure: !isLocalhost,
                sameSite: 'lax',
                maxAge: threeMonthsInSeconds,
                path: '/',
            })
        }

        return response
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        const host = request.headers.get('host') || ''
        const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1')
        const errorRedirect = isLocalhost ? `http://${host}` : ''
        return NextResponse.redirect(`${errorRedirect}/?error=${encodeURIComponent(errorMessage)}`)
    }
}
