import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { db } from '@/lib/db'

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.sweetflipsrewards.com'

if (!TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN must be set in environment variables')
}

const BOT_TOKEN = TELEGRAM_BOT_TOKEN

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const params: Record<string, string> = {}

        // Extract all query parameters
        searchParams.forEach((value, key) => {
            params[key] = value
        })

        const hashReceived = params.hash
        if (!hashReceived) {
            const host = request.headers.get('host') || ''
            const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1')
            const errorRedirect = isLocalhost ? `http://${host}` : APP_URL
            return NextResponse.redirect(`${errorRedirect}/?error=${encodeURIComponent('Missing hash parameter')}`)
        }

        // Remove hash from params for verification
        const { hash, ...paramsForCheck } = params

        // Create check string from sorted parameters
        const checkString = Object.keys(paramsForCheck)
            .sort()
            .map(key => `${key}=${paramsForCheck[key]}`)
            .join('\n')

        // Compute secret key: SHA256 of bot token
        const secretKey = crypto.createHash('sha256').update(BOT_TOKEN).digest()

        // Compute HMAC-SHA256
        const hmac = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex')

        // Verify hash
        if (hmac !== hashReceived) {
            const host = request.headers.get('host') || ''
            const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1')
            const errorRedirect = isLocalhost ? `http://${host}` : APP_URL
            return NextResponse.redirect(`${errorRedirect}/?error=${encodeURIComponent('Invalid signature')}`)
        }

        // Extract Telegram user data
        const telegramId = params.id
        const username = params.username || null
        const firstName = params.first_name || null
        const photoUrl = params.photo_url || null
        const authDate = params.auth_date

        if (!telegramId) {
            const host = request.headers.get('host') || ''
            const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1')
            const errorRedirect = isLocalhost ? `http://${host}` : APP_URL
            return NextResponse.redirect(`${errorRedirect}/?error=${encodeURIComponent('Missing Telegram user ID')}`)
        }

        const host = request.headers.get('host') || ''
        const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1')
        const baseUrl = isLocalhost ? `http://${host}` : APP_URL

        // Check if this is a linking flow (kick_user_id provided)
        const kickUserIdParam = params.kick_user_id
        if (kickUserIdParam) {
            // Linking flow: update existing user's Telegram info
            try {
                const kickUserIdBigInt = BigInt(kickUserIdParam)
                await db.user.update({
                    where: { kick_user_id: kickUserIdBigInt },
                    data: {
                        telegram_user_id: telegramId,
                        telegram_username: username || firstName || null,
                        telegram_connected: true,
                        updated_at: new Date(),
                    },
                })

                // Redirect to profile page with success
                return NextResponse.redirect(`${baseUrl}/profile?success=true&tab=connected`)
            } catch (error) {
                console.error('Error linking Telegram account:', error)
                return NextResponse.redirect(`${baseUrl}/profile?error=${encodeURIComponent('Failed to link Telegram account')}&tab=connected`)
            }
        }

        // If no kick_user_id, this shouldn't happen from profile page
        // Redirect to profile page with error
        return NextResponse.redirect(`${baseUrl}/profile?error=${encodeURIComponent('Missing user ID')}&tab=connected`)
    } catch (error) {
        console.error('Error handling Telegram auth callback:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        const host = request.headers.get('host') || ''
        const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1')
        const errorRedirect = isLocalhost ? `http://${host}` : APP_URL
        return NextResponse.redirect(`${errorRedirect}/?error=${encodeURIComponent(errorMessage)}`)
    }
}
