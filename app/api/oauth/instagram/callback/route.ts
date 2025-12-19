import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
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

        if (error) {
            return NextResponse.redirect(
                `${APP_URL}/profile?tab=connected&error=instagram_oauth_failed`
            )
        }

        if (!code || !state) {
            return NextResponse.redirect(
                `${APP_URL}/profile?tab=connected&error=missing_params`
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
        const appId = process.env.INSTAGRAM_APP_ID
        const appSecret = process.env.INSTAGRAM_APP_SECRET
        const redirectUri = process.env.INSTAGRAM_REDIRECT_URI || `${APP_URL}/api/oauth/instagram/callback`

        if (!appId || !appSecret) {
            return NextResponse.redirect(
                `${APP_URL}/profile?tab=connected&error=config_error`
            )
        }

        // Instagram Basic Display API token exchange
        const tokenResponse = await fetch('https://api.instagram.com/oauth/access_token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: appId,
                client_secret: appSecret,
                grant_type: 'authorization_code',
                redirect_uri: redirectUri,
                code: code,
            }),
        })

        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text()
            console.error('Instagram token exchange failed:', errorText)
            return NextResponse.redirect(
                `${APP_URL}/profile?tab=connected&error=token_exchange_failed`
            )
        }

        const tokenData = await tokenResponse.json()
        const accessToken = tokenData.access_token

        if (!accessToken) {
            return NextResponse.redirect(
                `${APP_URL}/profile?tab=connected&error=no_access_token`
            )
        }

        // Fetch user info from Instagram Graph API
        const userResponse = await fetch(`https://graph.instagram.com/me?fields=id,username&access_token=${accessToken}`)

        if (!userResponse.ok) {
            const errorText = await userResponse.text()
            console.error('Instagram user fetch failed:', errorText)
            return NextResponse.redirect(
                `${APP_URL}/profile?tab=connected&error=fetch_user_failed`
            )
        }

        const instagramUser = await userResponse.json()

        if (!instagramUser || !instagramUser.id || !instagramUser.username) {
            return NextResponse.redirect(
                `${APP_URL}/profile?tab=connected&error=invalid_user_data`
            )
        }

        // Save to database
        const kickUserIdBigInt = BigInt(kickUserId)

        // Update with Instagram connection data
        await db.user.update({
            where: { kick_user_id: kickUserIdBigInt },
            data: {
                instagram_connected: true,
                instagram_user_id: instagramUser.id,
                instagram_username: instagramUser.username,
                instagram_access_token_hash: hashToken(accessToken),
            },
        })

        return NextResponse.redirect(
            `${APP_URL}/profile?tab=connected&success=instagram_connected`
        )
    } catch (error) {
        console.error('Error in Instagram OAuth callback:', error)
        return NextResponse.redirect(
            `${APP_URL}/profile?tab=connected&error=callback_error`
        )
    }
}
