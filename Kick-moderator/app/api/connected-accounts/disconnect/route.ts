import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { kick_user_id, provider } = body

        if (!kick_user_id || !provider) {
            return NextResponse.json(
                { error: 'kick_user_id and provider are required' },
                { status: 400 }
            )
        }

        if (provider === 'kick') {
            return NextResponse.json(
                { error: 'Cannot disconnect Kick account' },
                { status: 400 }
            )
        }

        const kickUserIdBigInt = BigInt(kick_user_id)

        const updateData: any = {}

        if (provider === 'discord') {
            updateData.discord_connected = false
            updateData.discord_user_id = null
            updateData.discord_username = null
            updateData.discord_access_token_hash = null
        } else if (provider === 'telegram') {
            updateData.telegram_connected = false
            updateData.telegram_user_id = null
            updateData.telegram_username = null
            updateData.telegram_access_token_hash = null
        }

        await db.user.update({
            where: { kick_user_id: kickUserIdBigInt },
            data: updateData,
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Error disconnecting account:', error)
        return NextResponse.json(
            { error: 'Failed to disconnect account' },
            { status: 500 }
        )
    }
}
