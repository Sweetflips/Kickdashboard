import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { evaluateAchievementsForUser } from '@/lib/achievements-engine'

// Telegram Bot API types
interface TelegramUpdate {
    update_id: number
    message?: {
        message_id: number
        from: {
            id: number
            is_bot: boolean
            first_name: string
            username?: string
        }
        chat: {
            id: number
            type: string
        }
        date: number
        text: string
    }
}

export async function POST(request: Request) {
    try {
        const update: TelegramUpdate = await request.json()

        // Verify webhook secret (optional but recommended)
        const botToken = process.env.TELEGRAM_BOT_TOKEN
        if (!botToken) {
            return NextResponse.json({ ok: false, error: 'Bot token not configured' }, { status: 500 })
        }

        // Handle message updates
        if (update.message && update.message.text) {
            const { text, from } = update.message

            // Check if it's a /start command with auth token
            if (text.startsWith('/start ')) {
                const authToken = text.split('/start ')[1]

                try {
                    // Decode auth token
                    const authData = JSON.parse(Buffer.from(authToken, 'base64').toString())
                    const { kick_user_id } = authData

                    if (!kick_user_id || !from) {
                        return NextResponse.json({ ok: true })
                    }

                    // Save Telegram connection to database
                    const kickUserIdBigInt = BigInt(kick_user_id)
                    const updatedUser = await db.user.update({
                        where: { kick_user_id: kickUserIdBigInt },
                        data: {
                            telegram_connected: true,
                            telegram_user_id: from.id.toString(),
                            telegram_username: from.username || from.first_name,
                        },
                        select: { id: true, kick_user_id: true },
                    })

                    // Trigger achievement evaluation to unlock TELEGRAM_CONNECTED
                    try {
                        await evaluateAchievementsForUser({
                            userId: updatedUser.id,
                            kickUserId: updatedUser.kick_user_id,
                        })
                    } catch (evalError) {
                        console.error('Failed to evaluate achievements after Telegram connect:', evalError)
                    }

                    // Send confirmation message to user
                    const chatId = update.message.chat.id
                    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: chatId,
                            text: `✅ Your Telegram account (@${from.username || from.first_name}) has been successfully connected to your Kick account!`,
                        }),
                    })

                    return NextResponse.json({ ok: true })
                } catch (error) {
                    console.error('Error processing Telegram auth:', error)
                    return NextResponse.json({ ok: true }) // Still return ok to Telegram
                }
            }
        }

        return NextResponse.json({ ok: true })
    } catch (error) {
        console.error('Error handling Telegram webhook:', error)
        return NextResponse.json({ ok: false, error: 'Webhook error' }, { status: 500 })
    }
}

// GET endpoint for webhook verification (Telegram sends GET request when setting webhook)
export async function GET(request: Request) {
    return NextResponse.json({ message: 'Telegram webhook endpoint' })
}
