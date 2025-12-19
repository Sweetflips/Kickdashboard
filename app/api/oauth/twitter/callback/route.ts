import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { cookies } from 'next/headers'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

function hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex')
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const code = searchParams.get('code')
        const state = searchParams.get('state')
        const error = searchParams.get('error')

        const cookieStore = await cookies()
        const codeVerifier = cookieStore.get('twitter_code_verifier')?.value
        const storedState = cookieStore.get('twitter_oauth_state')?.value

        if (error) {
            return NextResponse.redirect(
                `${APP_URL}/profile?tab=connected&error=twitter_oauth_failed`
            )
        }

        if (!code || !state) {
            return NextResponse.redirect(
                `${APP_URL}/profile?tab=connected&error=missing_params`
            )
        }

        // Verify state matches
        if (state !== storedState) {
            return NextResponse.redirect(
                `${APP_URL}/profile?tab=connected&error=invalid_state`
            )
        }

        if (!codeVerifier) {
            return NextResponse.redirect(
                `${APP_URL}/profile?tab=connected&error=missing_code_verifier`
            )
        }

        // Decode state to get kick_user_id
        let kickUserId: string
        try {
            const stateData = JSON.parse(Buffer.from(state, 'base64').toString())
            kickUserId = stateData.kick_user_id
        } catch {
            return NextResponse.redirect(
                `${APP_URL}/profile?tab=connected&error=invalid_state`
            )
        }

        // Exchange code for access token
        const clientId = process.env.TWITTER_CLIENT_ID
        const clientSecret = process.env.TWITTER_CLIENT_SECRET
        const redirectUri = process.env.TWITTER_REDIRECT_URI || `${APP_URL}/api/oauth/twitter/callback`

        if (!clientId || !clientSecret) {
            return NextResponse.redirect(
                `${APP_URL}/profile?tab=connected&error=config_error`
            )
        }

        // Twitter OAuth 2.0 token exchange with PKCE
        const tokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
            },
            body: new URLSearchParams({
                code: code,
                grant_type: 'authorization_code',
                client_id: clientId,
                redirect_uri: redirectUri,
                code_verifier: codeVerifier,
            }),
        })

        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text()
            console.error('Twitter token exchange failed:', errorText)
            return NextResponse.redirect(
                `${APP_URL}/profile?tab=connected&error=token_exchange_failed`
            )
        }

        const tokenData = await tokenResponse.json()
        const accessToken = tokenData.access_token

        // Fetch user info from Twitter
        const userResponse = await fetch('https://api.twitter.com/2/users/me?user.fields=username', {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        })

        if (!userResponse.ok) {
            const errorText = await userResponse.text()
            console.error('Twitter user fetch failed:', errorText)
            return NextResponse.redirect(
                `${APP_URL}/profile?tab=connected&error=fetch_user_failed`
            )
        }

        const twitterUserData = await userResponse.json()
        const twitterUser = twitterUserData.data

        if (!twitterUser || !twitterUser.id || !twitterUser.username) {
            return NextResponse.redirect(
                `${APP_URL}/profile?tab=connected&error=invalid_user_data`
            )
        }

        // Save to database
        const kickUserIdBigInt = BigInt(kickUserId)

        // Update with Twitter connection data
        await db.user.update({
            where: { kick_user_id: kickUserIdBigInt },
            data: {
                twitter_connected: true,
                twitter_user_id: twitterUser.id,
                twitter_username: twitterUser.username,
                twitter_access_token_hash: hashToken(accessToken),
            },
        })

        // Clear cookies
        const response = NextResponse.redirect(
            `${APP_URL}/profile?tab=connected&success=twitter_connected`
        )
        response.cookies.delete('twitter_code_verifier')
        response.cookies.delete('twitter_oauth_state')

        return response
    } catch (error) {
        console.error('Error in Twitter OAuth callback:', error)
        return NextResponse.redirect(
            `${APP_URL}/profile?tab=connected&error=callback_error`
        )
    }
}
