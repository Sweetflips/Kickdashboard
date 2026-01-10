import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { getKickBotCredentials } from '@/lib/kick-oauth-creds'

export const dynamic = 'force-dynamic'

const KICK_OAUTH_BASE = 'https://id.kick.com'
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.kickdashboard.com').replace(/\/$/, '')
const APP_HOST = (() => {
    try {
        return new URL(APP_URL).host
    } catch {
        return 'www.kickdashboard.com'
    }
})()
const COOKIE_DOMAIN = APP_HOST.includes('localhost')
    ? undefined
    : `.${APP_HOST.replace(/:\d+$/, '').replace(/^www\./, '')}`

// Generate PKCE code verifier and challenge
function generatePKCE() {
    const codeVerifier = crypto.randomBytes(32).toString('base64url')
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url')
    return { codeVerifier, codeChallenge }
}

/**
 * Build redirect URI for bot callback
 */
function buildBotRedirectUri(request: Request): string {
    const explicitRedirectUri = process.env.KICK_BOT_REDIRECT_URI
    if (explicitRedirectUri) {
        return explicitRedirectUri
    }

    const host = request.headers.get('host') || ''
    const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1')

    if (!isLocalhost) {
        return `${APP_URL}/api/auth/sweetflipsbot/callback`
    }

    const proto = isLocalhost ? 'http' : 'https'
    return `${proto}://${host}/api/auth/sweetflipsbot/callback`
}

/**
 * Bot-only OAuth authorization route
 * Visit: /api/auth/sweetflipsbot to start bot authorization
 */
export async function GET(request: Request) {
    try {
        const host = request.headers.get('host') || ''
        const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1')

        // Get bot credentials
        let clientId: string
        try {
            const creds = getKickBotCredentials()
            clientId = creds.clientId
        } catch (credError) {
            return NextResponse.json({
                error: 'Bot OAuth credentials not configured',
                hint: 'Set KICK_BOT_CLIENT_ID and KICK_BOT_CLIENT_SECRET environment variables',
            }, { status: 500 })
        }

        const redirectUri = buildBotRedirectUri(request)
        const state = crypto.randomUUID()
        const { codeVerifier, codeChallenge } = generatePKCE()

        // Bot scopes - includes moderation
        const scopes = [
            'events:subscribe',
            'user:read',
            'chat:write',
            'channel:read',
            'moderation:ban',
        ]
        const scopeString = scopes.join(' ')

        const authUrl = `${KICK_OAUTH_BASE}/oauth/authorize?` +
            `response_type=code&` +
            `client_id=${clientId}&` +
            `redirect_uri=${encodeURIComponent(redirectUri)}&` +
            `scope=${encodeURIComponent(scopeString)}&` +
            `code_challenge=${codeChallenge}&` +
            `code_challenge_method=S256&` +
            `state=${state}&` +
            `prompt=consent`

        // Log for debugging
        console.log(`[Bot Auth] Starting authorization with redirect_uri=${redirectUri}, client_id=${clientId.substring(0, 8)}...${clientId.slice(-4)}`)

        // Redirect to Kick OAuth
        const response = NextResponse.redirect(authUrl)

        // Store code_verifier in cookie
        response.cookies.set('pkce_code_verifier', codeVerifier, {
            httpOnly: true,
            secure: !isLocalhost,
            sameSite: 'lax',
            maxAge: 7776000, // 3 months
            path: '/',
            domain: isLocalhost ? undefined : COOKIE_DOMAIN,
        })

        return response
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error('❌ Bot auth error:', errorMessage)
        return NextResponse.json({
            error: 'Failed to start bot authorization',
            details: errorMessage,
        }, { status: 500 })
    }
}
