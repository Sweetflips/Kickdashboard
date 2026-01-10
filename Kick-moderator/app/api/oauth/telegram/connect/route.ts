import { NextResponse } from 'next/server'

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { kick_user_id } = body

        if (!kick_user_id) {
            return NextResponse.json(
                { error: 'kick_user_id is required' },
                { status: 400 }
            )
        }

        // Telegram Bot API configuration
        const botToken = process.env.TELEGRAM_BOT_TOKEN
        const botUsername = process.env.TELEGRAM_BOT_USERNAME

        if (!botToken || !botUsername) {
            return NextResponse.json(
                { error: 'Telegram Bot not configured - TELEGRAM_BOT_TOKEN or TELEGRAM_BOT_USERNAME missing' },
                { status: 500 }
            )
        }

        // Generate a unique auth token for this user
        const authToken = Buffer.from(JSON.stringify({ kick_user_id, timestamp: Date.now() })).toString('base64')

        // Create deep link to bot with start parameter
        // Format: https://t.me/{bot_username}?start={auth_token}
        const authUrl = `https://t.me/${botUsername}?start=${authToken}`

        return NextResponse.json({
            authUrl,
            botUsername,
            message: `Please start a conversation with @${botUsername} on Telegram to complete the connection.`
        })
    } catch (error) {
        console.error('Error initiating Telegram OAuth:', error)
        return NextResponse.json(
            { error: 'Failed to initiate Telegram connection', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
