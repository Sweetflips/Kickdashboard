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
                `${APP_URL}/profile?tab=connected&error=discord_oauth_failed`
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
        const clientId = process.env.DISCORD_CLIENT_ID
        const clientSecret = process.env.DISCORD_CLIENT_SECRET
        const redirectUri = process.env.DISCORD_REDIRECT_URI || `${APP_URL}/api/oauth/discord/callback`

        if (!clientId || !clientSecret) {
            return NextResponse.redirect(
                `${APP_URL}/profile?tab=connected&error=config_error`
            )
        }

        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: redirectUri,
            }),
        })

        if (!tokenResponse.ok) {
            return NextResponse.redirect(
                `${APP_URL}/profile?tab=connected&error=token_exchange_failed`
            )
        }

        const tokenData = await tokenResponse.json()
        const accessToken = tokenData.access_token

        // Fetch user info from Discord
        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        })

        if (!userResponse.ok) {
            return NextResponse.redirect(
                `${APP_URL}/profile?tab=connected&error=fetch_user_failed`
            )
        }

        const discordUser = await userResponse.json()

        // Save to database
        const kickUserIdBigInt = BigInt(kickUserId)

        // Update with Discord connection data
        await db.user.update({
            where: { kick_user_id: kickUserIdBigInt },
            data: {
                discord_connected: true,
                discord_user_id: discordUser.id,
                discord_username: discordUser.username,
                discord_access_token_hash: hashToken(accessToken),
            },
        })

        return NextResponse.redirect(
            `${APP_URL}/profile?tab=connected&success=discord_connected`
        )
    } catch (error) {
        console.error('Error in Discord OAuth callback:', error)
        return NextResponse.redirect(
            `${APP_URL}/profile?tab=connected&error=callback_error`
        )
    }
}
