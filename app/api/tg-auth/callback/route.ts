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
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.log('📱 [TELEGRAM AUTH CALLBACK] Received callback request')
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
        
        const { searchParams } = new URL(request.url)
        const params: Record<string, string> = {}

        // Extract all query parameters
        searchParams.forEach((value, key) => {
            params[key] = value
        })

        console.log('📥 [PARAMS] Received parameters:')
        console.log(`   ├─ kick_user_id: ${params.kick_user_id || 'N/A'}`)
        console.log(`   ├─ id: ${params.id || 'N/A'}`)
        console.log(`   ├─ username: ${params.username || 'N/A'}`)
        console.log(`   ├─ first_name: ${params.first_name || 'N/A'}`)
        console.log(`   ├─ hash: ${params.hash ? '***' + params.hash.slice(-8) : 'N/A'}`)
        console.log(`   └─ auth_date: ${params.auth_date || 'N/A'}\n`)

        const hashReceived = params.hash
        if (!hashReceived) {
            console.error('❌ [VALIDATION] Missing hash parameter')
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

        console.log('🔐 [VERIFICATION] Verifying Telegram signature...')
        console.log(`   ├─ Received hash: ${hashReceived.slice(0, 16)}...${hashReceived.slice(-8)}`)
        console.log(`   ├─ Computed hash: ${hmac.slice(0, 16)}...${hmac.slice(-8)}`)

        // Verify hash
        if (hmac !== hashReceived) {
            console.error('❌ [VERIFICATION] Hash verification failed!')
            console.error(`   └─ Hashes do not match`)
            const host = request.headers.get('host') || ''
            const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1')
            const errorRedirect = isLocalhost ? `http://${host}` : APP_URL
            return NextResponse.redirect(`${errorRedirect}/?error=${encodeURIComponent('Invalid signature')}`)
        }

        console.log('✅ [VERIFICATION] Hash verification passed\n')

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
                console.log(`🔗 [TELEGRAM LINK] Linking Telegram account for Kick user: ${kickUserIdParam}`)
                console.log(`   ├─ Telegram ID: ${telegramId}`)
                console.log(`   ├─ Telegram Username: ${username || firstName || 'N/A'}`)
                
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

                console.log(`✅ [TELEGRAM LINK] Successfully linked Telegram account`)
                const redirectUrl = `${baseUrl}/profile?success=true&tab=connected`
                console.log(`   └─ Redirecting to: ${redirectUrl}`)
                
                // Redirect to profile page with success
                return NextResponse.redirect(redirectUrl)
            } catch (error) {
                console.error('❌ [TELEGRAM LINK] Error linking Telegram account:', error)
                const errorMessage = error instanceof Error ? error.message : 'Unknown error'
                console.error(`   └─ Error details: ${errorMessage}`)
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
