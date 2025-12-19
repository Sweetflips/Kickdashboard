import { NextResponse } from 'next/server'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { kick_user_id } = body

        if (!kick_user_id) {
            return NextResponse.json(
                { error: 'kick_user_id is required' },
                { status: 400 }
            )
        }

        // Twitter OAuth 2.0 configuration
        const clientId = process.env.TWITTER_CLIENT_ID
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
        const redirectUri = process.env.TWITTER_REDIRECT_URI || `${baseUrl}/api/oauth/twitter/callback`
        const scope = 'users.read tweet.read'

        if (!clientId) {
            console.error('Twitter OAuth Error: TWITTER_CLIENT_ID not configured')
            return NextResponse.json(
                { error: 'Twitter OAuth not configured - TWITTER_CLIENT_ID missing' },
                { status: 500 }
            )
        }

        // In production, never fall back to localhost redirect URIs
        if (
            process.env.NODE_ENV === 'production' &&
            !process.env.TWITTER_REDIRECT_URI &&
            !process.env.NEXT_PUBLIC_APP_URL &&
            !process.env.NEXT_PUBLIC_BASE_URL
        ) {
            console.error('Twitter OAuth Error: No production base URL configured (set TWITTER_REDIRECT_URI or NEXT_PUBLIC_APP_URL)')
            return NextResponse.json(
                { error: 'Twitter OAuth not configured - set TWITTER_REDIRECT_URI (or NEXT_PUBLIC_APP_URL)' },
                { status: 500 }
            )
        }

        // Generate PKCE code verifier and challenge
        const codeVerifier = crypto.randomBytes(32).toString('base64url')
        const codeChallenge = crypto
            .createHash('sha256')
            .update(codeVerifier)
            .digest('base64url')

        // Generate state parameter for CSRF protection
        // Use base64url to avoid '+' '/' '=' issues in query strings
        const state = Buffer.from(JSON.stringify({ kick_user_id })).toString('base64url')

        const params = new URLSearchParams({
            client_id: clientId,
            redirect_uri: redirectUri,
            response_type: 'code',
            scope,
            state,
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
        })

        const authUrl = `https://twitter.com/i/oauth2/authorize?${params.toString()}`

        // Store code_verifier/state in cookies (used in callback)
        const res = NextResponse.json({ authUrl })
        res.cookies.set('twitter_code_verifier', codeVerifier, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 600, // 10 minutes
        })
        res.cookies.set('twitter_oauth_state', state, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 600, // 10 minutes
        })

        return res
    } catch (error) {
        console.error('Error initiating Twitter OAuth:', error)
        return NextResponse.json(
            { error: 'Failed to initiate Twitter connection', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
