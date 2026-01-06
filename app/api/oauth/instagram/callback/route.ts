import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { evaluateAchievementsForUser } from '@/lib/achievements-engine'
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
        const errorReason = searchParams.get('error_reason')
        const errorDescription = searchParams.get('error_description')

        if (error) {
            console.error('Instagram/Facebook OAuth error:', { error, errorReason, errorDescription })
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

        // Exchange code for access token using Facebook Graph API
        const appId = process.env.INSTAGRAM_APP_ID
        const appSecret = process.env.INSTAGRAM_APP_SECRET
        const redirectUri = process.env.INSTAGRAM_REDIRECT_URI || `${APP_URL}/api/oauth/instagram/callback`

        if (!appId || !appSecret) {
            return NextResponse.redirect(
                `${APP_URL}/profile?tab=connected&error=config_error`
            )
        }

        // Meta OAuth token exchange
        const tokenUrl = new URL('https://graph.facebook.com/v24.0/oauth/access_token')
        tokenUrl.searchParams.set('client_id', appId)
        tokenUrl.searchParams.set('client_secret', appSecret)
        tokenUrl.searchParams.set('redirect_uri', redirectUri)
        tokenUrl.searchParams.set('code', code)

        const tokenResponse = await fetch(tokenUrl.toString())

        if (!tokenResponse.ok) {
            const errorData = await tokenResponse.json().catch(() => ({}))
            console.error('Meta token exchange failed:', errorData)
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

        // Get Facebook user profile (works without app review)
        const meResponse = await fetch(
            `https://graph.facebook.com/v24.0/me?fields=id,name,email&access_token=${accessToken}`
        )

        if (!meResponse.ok) {
            const errorData = await meResponse.json().catch(() => ({}))
            console.error('Facebook profile fetch failed:', errorData)
            return NextResponse.redirect(
                `${APP_URL}/profile?tab=connected&error=fetch_user_failed`
            )
        }

        const fbUser = await meResponse.json()

        if (!fbUser || !fbUser.id) {
            return NextResponse.redirect(
                `${APP_URL}/profile?tab=connected&error=invalid_user_data`
            )
        }

        // Save to database - we're storing Facebook connection as "Instagram" for now
        // since this is what the user initiated from the Instagram connect button
        const kickUserIdBigInt = BigInt(kickUserId)

        const updatedUser = await db.user.update({
            where: { kick_user_id: kickUserIdBigInt },
            data: {
                instagram_connected: true,
                instagram_user_id: fbUser.id,
                instagram_username: fbUser.name || 'Facebook User',
                instagram_access_token_hash: hashToken(accessToken),
            },
            select: { id: true, kick_user_id: true },
        })

        // Trigger achievement evaluation to unlock INSTAGRAM_CONNECTED
        try {
            await evaluateAchievementsForUser({
                userId: updatedUser.id,
                kickUserId: updatedUser.kick_user_id,
            })
        } catch (evalError) {
            console.error('Failed to evaluate achievements after Instagram connect:', evalError)
        }

        return NextResponse.redirect(
            `${APP_URL}/profile?tab=connected&success=instagram_connected`
        )
    } catch (error) {
        console.error('Error in Instagram/Facebook OAuth callback:', error)
        return NextResponse.redirect(
            `${APP_URL}/profile?tab=connected&error=callback_error`
        )
    }
}
