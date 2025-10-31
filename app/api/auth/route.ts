import crypto from 'crypto'
import { NextResponse } from 'next/server'

const KICK_CLIENT_ID = process.env.KICK_CLIENT_ID || '01JPSA10J5XJ6TK18KWKVSJFCT'
const KICK_CLIENT_SECRET = process.env.KICK_CLIENT_SECRET || '0e910838e450e763be8abfac4b95d8c33abba8ad75538845475862d64d643bda'
const KICK_API_BASE = 'https://api.kick.com/public/v1'
const KICK_OAUTH_BASE = 'https://id.kick.com'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.sweetflipsrewards.com'

// Generate PKCE code verifier and challenge
function generatePKCE() {
    const codeVerifier = crypto.randomBytes(32).toString('base64url')
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url')
    return { codeVerifier, codeChallenge }
}

// Generate OAuth authorization URL
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const action = searchParams.get('action')

        if (action === 'authorize') {
            // Generate authorization URL with PKCE
            const host = request.headers.get('host') || ''
            const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1')
            const redirectUri = isLocalhost
                ? `http://${host}/api/auth/callback`
                : `${APP_URL}/api/auth/callback`

            const state = crypto.randomUUID()
            const { codeVerifier, codeChallenge } = generatePKCE()
            // Add chat:write scope for sending messages
            const scopes = ['events:subscribe', 'user:read', 'chat:write']

            const authUrl = `${KICK_OAUTH_BASE}/oauth/authorize?` +
                `response_type=code&` +
                `client_id=${KICK_CLIENT_ID}&` +
                `redirect_uri=${encodeURIComponent(redirectUri)}&` +
                `scope=${encodeURIComponent(scopes.join(' '))}&` +
                `code_challenge=${codeChallenge}&` +
                `code_challenge_method=S256&` +
                `state=${state}`

            // Redirect directly to Kick OAuth
            const response = NextResponse.redirect(authUrl)

            // Store code_verifier in a cookie for later use
            response.cookies.set('pkce_code_verifier', codeVerifier, {
                httpOnly: true,
                secure: !isLocalhost,
                sameSite: 'lax',
                maxAge: 600, // 10 minutes
            })

            return response
        }

        if (action === 'token') {
            const code = searchParams.get('code')
            const host = request.headers.get('host') || ''
            const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1')
            const redirectUri = searchParams.get('redirectUri') ||
                (isLocalhost
                    ? `http://${host}/api/auth/callback`
                    : `${APP_URL}/api/auth/callback`)

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
                client_id: KICK_CLIENT_ID,
                client_secret: KICK_CLIENT_SECRET,
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
