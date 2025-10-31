import { NextResponse } from 'next/server'

const KICK_API_BASE = 'https://api.kick.com/public/v1'

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { accessToken, broadcasterUserId, content, type = 'user' } = body

        if (!accessToken) {
            return NextResponse.json(
                { error: 'Access token is required' },
                { status: 401 }
            )
        }

        if (!broadcasterUserId) {
            return NextResponse.json(
                { error: 'broadcaster_user_id is required' },
                { status: 400 }
            )
        }

        if (!content || !content.trim()) {
            return NextResponse.json(
                { error: 'Message content is required' },
                { status: 400 }
            )
        }

        // Validate content length (max 500 chars)
        if (content.length > 500) {
            return NextResponse.json(
                { error: 'Message content cannot exceed 500 characters' },
                { status: 400 }
            )
        }

        // Validate type
        if (type !== 'user' && type !== 'bot') {
            return NextResponse.json(
                { error: 'Type must be either "user" or "bot"' },
                { status: 400 }
            )
        }

        console.log(`📤 Sending chat message to broadcaster ${broadcasterUserId}: ${content.substring(0, 50)}...`)
        console.log(`🔑 Access token (first 20 chars): ${accessToken.substring(0, 20)}...`)

        // Send message to Kick API
        const response = await fetch(`${KICK_API_BASE}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
                broadcaster_user_id: broadcasterUserId,
                content: content.trim(),
                type: type,
            }),
        })

        if (!response.ok) {
            const errorText = await response.text()
            console.error(`❌ Failed to send message: ${response.status} - ${errorText}`)
            console.error(`Request URL: ${KICK_API_BASE}/chat`)
            console.error(`Request body:`, JSON.stringify({
                broadcaster_user_id: broadcasterUserId,
                content: content.trim(),
                type: type,
            }))

            // Try to parse error response
            let errorDetails = errorText
            try {
                const errorJson = JSON.parse(errorText)
                errorDetails = errorJson.message || errorJson.error || errorText
            } catch {
                // Keep original error text
            }

            return NextResponse.json(
                { error: `Failed to send message: ${response.status}`, details: errorDetails },
                { status: response.status }
            )
        }

        const data = await response.json()
        console.log(`✅ Message sent successfully`)

        return NextResponse.json({
            success: true,
            data: data,
            message: 'Message sent successfully',
        })
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error('Chat send API error:', errorMessage)
        return NextResponse.json(
            { error: 'Failed to send message', details: errorMessage },
            { status: 500 }
        )
    }
}
