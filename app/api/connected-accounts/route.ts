import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

const DEBUG_CONNECTED_ACCOUNTS = String(process.env.DEBUG_CONNECTED_ACCOUNTS || '').toLowerCase() === 'true'

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const kickUserId = searchParams.get('kick_user_id')

        if (!kickUserId) {
            return NextResponse.json(
                { error: 'kick_user_id is required' },
                { status: 400 }
            )
        }

        if (DEBUG_CONNECTED_ACCOUNTS) {
            console.log(`[CONNECTED ACCOUNTS] fetch kick_user_id=${kickUserId}`)
        }

        const kickUserIdBigInt = BigInt(kickUserId)

        const user = await db.user.findUnique({
            where: { kick_user_id: kickUserIdBigInt },
            select: {
                kick_user_id: true,
                username: true,
                kick_connected: true,
                discord_connected: true,
                discord_username: true,
                discord_user_id: true,
                telegram_connected: true,
                telegram_username: true,
                telegram_user_id: true,
                twitter_connected: true,
                twitter_username: true,
                twitter_user_id: true,
                instagram_connected: true,
                instagram_username: true,
                instagram_user_id: true,
                razed_connected: true,
                razed_username: true,
                razed_user_id: true,
            },
        })

        if (!user) {
            if (DEBUG_CONNECTED_ACCOUNTS) {
                console.log(`[CONNECTED ACCOUNTS] result kick_user_id=${kickUserId} not_found`)
            }
            return NextResponse.json({ accounts: [] })
        }

        const accounts = [
            {
                provider: 'kick' as const,
                connected: user.kick_connected ?? true,
                username: user.username,
                userId: kickUserId.toString(),
            },
            {
                provider: 'discord' as const,
                connected: user.discord_connected ?? false,
                username: user.discord_username || undefined,
                userId: user.discord_user_id || undefined,
            },
            {
                provider: 'telegram' as const,
                connected: user.telegram_connected ?? false,
                username: user.telegram_username || undefined,
                userId: user.telegram_user_id || undefined,
            },
            {
                provider: 'twitter' as const,
                connected: user.twitter_connected ?? false,
                username: user.twitter_username || undefined,
                userId: user.twitter_user_id || undefined,
            },
            {
                provider: 'instagram' as const,
                connected: user.instagram_connected ?? false,
                username: user.instagram_username || undefined,
                userId: user.instagram_user_id || undefined,
            },
            {
                provider: 'razed' as const,
                connected: user.razed_connected ?? false,
                username: user.razed_username || undefined,
                userId: user.razed_user_id || undefined,
            },
        ]

        if (DEBUG_CONNECTED_ACCOUNTS) {
            // Single-line summary (keeps logs readable, avoids PII spam)
            const kick = accounts.find(a => a.provider === 'kick')
            const discord = accounts.find(a => a.provider === 'discord')
            const telegram = accounts.find(a => a.provider === 'telegram')
            const twitter = accounts.find(a => a.provider === 'twitter')
            const instagram = accounts.find(a => a.provider === 'instagram')
            const razed = accounts.find(a => a.provider === 'razed')
            console.log(
                `[CONNECTED ACCOUNTS] result kick_user_id=${kickUserId} username=${user.username}` +
                ` kick=${kick?.connected ? '1' : '0'}` +
                ` discord=${discord?.connected ? '1' : '0'}` +
                ` telegram=${telegram?.connected ? '1' : '0'}` +
                ` twitter=${twitter?.connected ? '1' : '0'}` +
                ` instagram=${instagram?.connected ? '1' : '0'}` +
                ` razed=${razed?.connected ? '1' : '0'}`
            )
        }

        return NextResponse.json({ accounts })
    } catch (error) {
        console.error('❌ Error fetching connected accounts:', error)
        return NextResponse.json(
            { error: 'Failed to fetch connected accounts' },
            { status: 500 }
        )
    }
}
