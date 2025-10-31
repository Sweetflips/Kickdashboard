import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

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
            },
        })

        if (!user) {
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
        ]

        return NextResponse.json({ accounts })
    } catch (error) {
        console.error('Error fetching connected accounts:', error)
        return NextResponse.json(
            { error: 'Failed to fetch connected accounts' },
            { status: 500 }
        )
    }
}
