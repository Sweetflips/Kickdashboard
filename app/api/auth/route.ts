import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { getKickBotCredentials, getKickUserCredentials } from '@/lib/kick-oauth-creds'

export const dynamic = 'force-dynamic'

const KICK_API_BASE = 'https://api.kick.com/public/v1'
const KICK_OAUTH_BASE = 'https://id.kick.com'
// Keep a single canonical host for auth flows (use www by default)
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.kickdashboard.com').replace(/\/$/, '')
const APP_HOST = (() => {
    try {
        return new URL(APP_URL).host
    } catch {
        return 'www.kickdashboard.com'
    }
})()
// Strip www. prefix and port to get root domain for cookies (works for both www and apex)
const COOKIE_DOMAIN = APP_HOST.includes('localhost')
    ? undefined
    : `.${APP_HOST.replace(/:\d+$/, '').replace(/^www\./, '')}`

const AUTH_FLOW_COOKIE = 'kick_auth_flow'

// Generate PKCE code verifier and challenge
function generatePKCE() {
    const codeVerifier = crypto.randomBytes(32).toString('base64url')
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url')
    return { codeVerifier, codeChallenge }
}

/**
 * Build redirect URI from request headers (proxy-aware)
 * Prefers x-forwarded-proto/x-forwarded-host, falls back to host header, then env var
 * For bot flows, uses the bot-specific callback URL
 */
function buildRedirectUri(request: Request, isBot: boolean = false): string {
    const headers = request.headers
    const forwardedHost = headers.get('x-forwarded-host')
    const forwardedProto = headers.get('x-forwarded-proto')
    const host = headers.get('host') || ''

    const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1')

    // Bot callback path
    const callbackPath = isBot ? '/api/auth/sweetflipsbot/callback' : '/api/auth/callback'

    // Check for explicit redirect URI override in environment (highest priority for bot)
    if (isBot) {
        const explicitBotRedirectUri = process.env.KICK_BOT_REDIRECT_URI
        if (explicitBotRedirectUri) {
            return explicitBotRedirectUri
        }
    }

    // In production, force the canonical APP_URL to keep cookies/redirects aligned
    if (!isLocalhost) {
        return `${APP_URL}${callbackPath}`
    }

    // Prefer forwarded headers if present (proxy/reverse proxy)
    if (forwardedHost) {
        const proto = forwardedProto || 'https'
        return `${proto}://${forwardedHost}${callbackPath}`
    }

    // Fallback to host header
    if (host) {
        const proto = isLocalhost ? 'http' : 'https'
        return `${proto}://${host}${callbackPath}`
    }

    // Final fallback to env var
    return `${APP_URL}${callbackPath}`
}

// Generate OAuth authorization URL
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const action = searchParams.get('action')
        const referralCode = searchParams.get('ref')

        if (action === 'debug') {
            const isBot = searchParams.get('bot') === '1'
            // Only use bot callback URL if explicitly requested AND we're in moderation/worker context
            const useBotCallback = isBot && (process.env.MODERATION_ONLY === 'true' || process.env.RUN_AS_WORKER === 'true' || process.env.KICK_BOT_REDIRECT_URI)
            const redirectUri = buildRedirectUri(request, useBotCallback)
            const { clientId } = isBot ? getKickBotCredentials() : getKickUserCredentials()

            const scopes = [
                'events:subscribe',
                'user:read',
                'chat:write',
                'channel:read',
            ]
            if (isBot) {
                scopes.push('moderation:ban')
            }

            const scopeString = scopes.join(' ')
            const { codeChallenge } = generatePKCE()
            const state = crypto.randomUUID()

            const authUrl = `${KICK_OAUTH_BASE}/oauth/authorize?` +
                `response_type=code&` +
                `client_id=${clientId}&` +
                `redirect_uri=${encodeURIComponent(redirectUri)}&` +
                `scope=${encodeURIComponent(scopeString)}&` +
                `code_challenge=${codeChallenge}&` +
                `code_challenge_method=S256&` +
                `state=${state}` +
                (isBot ? `&prompt=consent` : '')

            return NextResponse.json({
                ok: true,
                now: new Date().toISOString(),
                isBot,
                clientKind: isBot ? 'bot' : 'user',
                redirectUri,
                scopes,
                scopeString,
                authUrl,
                // Best-effort deploy identifiers (depends on Railway runtime env vars)
                railwayCommit:
                    process.env.RAILWAY_GIT_COMMIT_SHA ||
                    process.env.RAILWAY_GIT_COMMIT ||
                    process.env.RAILWAY_GIT_SHA ||
                    null,
                railwayService:
                    process.env.RAILWAY_SERVICE_NAME ||
                    process.env.RAILWAY_SERVICE ||
                    null,
            })
        }

        if (action === 'authorize') {
            // Generate authorization URL with PKCE
            const host = request.headers.get('host') || ''
            const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1')
            const isBot = searchParams.get('bot') === '1'
            // Only use bot callback URL if explicitly requested AND we're in moderation/worker context
            // Check for MODERATION_ONLY or RUN_AS_WORKER env vars to ensure this is the worker branch
            const useBotCallback = isBot && (process.env.MODERATION_ONLY === 'true' || process.env.RUN_AS_WORKER === 'true' || process.env.KICK_BOT_REDIRECT_URI)
            const redirectUri = buildRedirectUri(request, useBotCallback)
            const { clientId } = isBot ? getKickBotCredentials() : getKickUserCredentials()

            const state = crypto.randomUUID()
            const { codeVerifier, codeChallenge } = generatePKCE()
            // Request all necessary scopes for full functionality:
            // - events:subscribe: Subscribe to webhook events (chat, follows, subscriptions)
            // - user:read: Read user information (including email)
            // - chat:write: Send chat messages
            // - channel:read: Read channel information (for thumbnails, stream status)
            // - moderation:ban: Execute moderation actions (ban/timeout) - ONLY for bot accounts
            const scopes = [
                'events:subscribe',
                'user:read',
                'chat:write',
                'channel:read',
            ]

            // Add moderation scope only for bot authorization
            // Note: Kick may not display all requested scopes in the UI unless the user is prompted to re-consent.
            if (isBot) {
                scopes.push('moderation:ban')
            }

            const scopeString = scopes.join(' ')
            const authUrl = `${KICK_OAUTH_BASE}/oauth/authorize?` +
                `response_type=code&` +
                `client_id=${clientId}&` +
                `redirect_uri=${encodeURIComponent(redirectUri)}&` +
                `scope=${encodeURIComponent(scopeString)}&` +
                `code_challenge=${codeChallenge}&` +
                `code_challenge_method=S256&` +
                `state=${state}` +
                // Force Kick to re-show the consent screen so new scopes (like moderation:ban) get granted
                (isBot ? `&prompt=consent` : '')

            // Redirect directly to Kick OAuth
            const response = NextResponse.redirect(authUrl)
            // Store code_verifier in a cookie for later use
            response.cookies.set('pkce_code_verifier', codeVerifier, {
                httpOnly: true,
                secure: !isLocalhost,
                sameSite: 'lax',
                maxAge: 7776000, // 3 months (90 days)
                path: '/',
                domain: isLocalhost ? undefined : COOKIE_DOMAIN,
            })

            // Store which OAuth client kind was used so callback can pick the right credentials
            response.cookies.set(AUTH_FLOW_COOKIE, isBot ? 'bot' : 'user', {
                httpOnly: true,
                secure: !isLocalhost,
                sameSite: 'lax',
                maxAge: 15 * 60, // 15 minutes
                path: '/',
                domain: isLocalhost ? undefined : COOKIE_DOMAIN,
            })

            // Store referral code in a cookie if provided
            if (referralCode) {
                response.cookies.set('referral_code', referralCode, {
                    httpOnly: false,
                    secure: !isLocalhost,
                    sameSite: 'lax',
                    maxAge: 7776000, // 3 months (90 days)
                    path: '/',
                    domain: isLocalhost ? undefined : COOKIE_DOMAIN,
                })
            }

            return response
        }

        if (action === 'token') {
            const isBot = searchParams.get('bot') === '1'
            const { clientId, clientSecret } = isBot ? getKickBotCredentials() : getKickUserCredentials()
            const code = searchParams.get('code')
            const redirectUri = searchParams.get('redirectUri') || buildRedirectUri(request)
            const host = request.headers.get('host') || ''
            const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1')

            if (!code) {
                return NextResponse.json(
                    { error: 'Authorization code is required' },
                    { status: 400 }
                )
            }

            // Get code_verifier from cookie
            const codeVerifier = request.headers.get('cookie')
                ?.split(';')
                .find(c => c.trim().startsWith('pkce_code_verifier='))
                ?.split('=')[1]

            if (!codeVerifier) {
                return NextResponse.json(
                    { error: 'PKCE code verifier is required' },
                    { status: 400 }
                )
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

            const response = await fetch(`${KICK_OAUTH_BASE}/oauth/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: params.toString(),
            })

            if (!response.ok) {
                const errorText = await response.text()
                return NextResponse.json(
                    { error: `Failed to exchange token: ${response.status} - ${errorText}` },
                    { status: response.status }
                )
            }

            const data = await response.json()
            return NextResponse.json(data)
        }

        return NextResponse.json(
            { error: 'Invalid action' },
            { status: 400 }
        )
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return NextResponse.json(
            { error: 'Failed to process request', details: errorMessage },
            { status: 500 }
        )
    }
}

interface SubscribeEventRequest {
    name: string
    version: number
}

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { accessToken, broadcasterUserId } = body

        if (!accessToken) {
            return NextResponse.json(
                { error: 'Access token is required' },
                { status: 400 }
            )
        }

        if (!broadcasterUserId) {
            return NextResponse.json(
                { error: 'Broadcaster user ID is required' },
                { status: 400 }
            )
        }

        // Subscribe to chat.message.sent event
        const events: SubscribeEventRequest[] = [
            {
                name: 'chat.message.sent',
                version: 1,
            },
        ]

        const response = await fetch(`${KICK_API_BASE}/events/subscriptions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
                events,
                method: 'webhook',
                broadcaster_user_id: broadcasterUserId,
            }),
        })

        if (!response.ok) {
            const errorText = await response.text()
            return NextResponse.json(
                { error: `Failed to subscribe: ${response.status} - ${errorText}` },
                { status: response.status }
            )
        }

        const data = await response.json()

        return NextResponse.json({
            success: true,
            subscriptions: data,
            message: 'Successfully subscribed to chat.message.sent events',
        })
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return NextResponse.json(
            { error: 'Failed to subscribe to events', details: errorMessage },
            { status: 500 }
        )
    }
}
