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

        // Generate PKCE code verifier and challenge
        const codeVerifier = crypto.randomBytes(32).toString('base64url')
        const codeChallenge = crypto
            .createHash('sha256')
            .update(codeVerifier)
            .digest('base64url')

        // Generate state parameter for CSRF protection
        const state = Buffer.from(JSON.stringify({ kick_user_id })).toString('base64')

        // Store code_verifier in a cookie (will be used in callback)
        const response = NextResponse.json({ authUrl: '' })
        response.cookies.set('twitter_code_verifier', codeVerifier, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 600, // 10 minutes
        })
        response.cookies.set('twitter_oauth_state', state, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 600, // 10 minutes
        })

        const authUrl = `https://twitter.com/i/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`

        return NextResponse.json({ authUrl }, {
            headers: response.headers,
        })
    } catch (error) {
        console.error('Error initiating Twitter OAuth:', error)
        return NextResponse.json(
            { error: 'Failed to initiate Twitter connection', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
