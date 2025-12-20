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
        const errorReason = searchParams.get('error_reason')
        const errorDescription = searchParams.get('error_description')

        if (error) {
            console.error('Instagram OAuth error:', { error, errorReason, errorDescription })
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

        // Meta OAuth token exchange (NOT api.instagram.com)
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

        // Get Facebook user's connected Instagram accounts
        // First, get the user's Facebook Pages (required for Instagram Business accounts)
        const pagesResponse = await fetch(
            `https://graph.facebook.com/v24.0/me/accounts?access_token=${accessToken}`
        )

        let instagramUserId: string | null = null
        let instagramUsername: string | null = null

        if (pagesResponse.ok) {
            const pagesData = await pagesResponse.json()

            // Check each page for connected Instagram account
            for (const page of pagesData.data || []) {
                const igResponse = await fetch(
                    `https://graph.facebook.com/v24.0/${page.id}?fields=instagram_business_account{id,username}&access_token=${accessToken}`
                )

                if (igResponse.ok) {
                    const igData = await igResponse.json()
                    if (igData.instagram_business_account) {
                        instagramUserId = igData.instagram_business_account.id
                        instagramUsername = igData.instagram_business_account.username
                        break
                    }
                }
            }
        }

        // If no business account found, try to get personal Instagram account via /me endpoint
        if (!instagramUserId) {
            // For personal accounts, we need to use the instagram_basic permission
            // and query the Instagram Graph API directly
            const meResponse = await fetch(
                `https://graph.facebook.com/v24.0/me?fields=id,name&access_token=${accessToken}`
            )

            if (meResponse.ok) {
                const meData = await meResponse.json()
                // For apps with instagram_basic, we can try getting Instagram account
                const igAccountResponse = await fetch(
                    `https://graph.facebook.com/v24.0/me/instagram_accounts?access_token=${accessToken}`
                )

                if (igAccountResponse.ok) {
                    const igAccounts = await igAccountResponse.json()
                    if (igAccounts.data && igAccounts.data.length > 0) {
                        const firstAccount = igAccounts.data[0]
                        instagramUserId = firstAccount.id

                        // Fetch username for this account
                        const usernameResponse = await fetch(
                            `https://graph.facebook.com/v24.0/${firstAccount.id}?fields=username&access_token=${accessToken}`
                        )
                        if (usernameResponse.ok) {
                            const usernameData = await usernameResponse.json()
                            instagramUsername = usernameData.username
                        }
                    }
                }
            }
        }

        // If still no Instagram account found, the user might not have one connected
        if (!instagramUserId) {
            console.error('No Instagram account found for user')
            return NextResponse.redirect(
                `${APP_URL}/profile?tab=connected&error=no_instagram_account`
            )
        }

        // Save to database
        const kickUserIdBigInt = BigInt(kickUserId)

        // Update with Instagram connection data
        await db.user.update({
            where: { kick_user_id: kickUserIdBigInt },
            data: {
                instagram_connected: true,
                instagram_user_id: instagramUserId,
                instagram_username: instagramUsername || 'Unknown',
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
