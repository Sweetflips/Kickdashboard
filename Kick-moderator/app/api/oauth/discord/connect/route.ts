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

        // Discord OAuth configuration
        const clientId = process.env.DISCORD_CLIENT_ID
        const clientSecret = process.env.DISCORD_CLIENT_SECRET
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
        const redirectUri = process.env.DISCORD_REDIRECT_URI || `${baseUrl}/api/oauth/discord/callback`
        const scope = 'identify email guilds'

        if (!clientId) {
            console.error('Discord OAuth Error: DISCORD_CLIENT_ID not configured')
            return NextResponse.json(
                { error: 'Discord OAuth not configured - DISCORD_CLIENT_ID missing' },
                { status: 500 }
            )
        }

        if (!clientSecret) {
            console.error('Discord OAuth Error: DISCORD_CLIENT_SECRET not configured')
            return NextResponse.json(
                { error: 'Discord OAuth not configured - DISCORD_CLIENT_SECRET missing' },
                { status: 500 }
            )
        }

        // Generate state parameter for CSRF protection
        const state = Buffer.from(JSON.stringify({ kick_user_id })).toString('base64')

        const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${state}`

        return NextResponse.json({ authUrl })
    } catch (error) {
        console.error('Error initiating Discord OAuth:', error)
        return NextResponse.json(
            { error: 'Failed to initiate Discord connection', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
