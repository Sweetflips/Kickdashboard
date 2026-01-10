import { NextResponse } from 'next/server'

const KICK_API_BASE = 'https://api.kick.com/public/v1'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://kickdashboard.com'
const EXTERNAL_WEBHOOK_URL = process.env.EXTERNAL_WEBHOOK_URL || `${APP_URL}/api/webhooks/kick`

interface SubscribeEventRequest {
    name: string
    version: number
}

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { accessToken, broadcasterUserId, webhookUrl: customWebhookUrl } = body

        if (!accessToken) {
            return NextResponse.json(
                { error: 'Access token is required' },
                { status: 400 }
            )
        }

        if (!broadcasterUserId) {
            return NextResponse.json(
                { error: 'Broadcaster user ID is required' },
                { status: 400 }
            )
        }

        // Determine webhook URL based on environment
        const host = request.headers.get('host') || ''
        const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1')

        // Check for custom webhook URL from request, then environment variable, then defaults
        let webhookUrl: string
        if (customWebhookUrl) {
            // Use custom URL from request (e.g., ngrok tunnel)
            // Remove trailing slash and ensure it doesn't already have /api/webhook
            let baseUrl = customWebhookUrl.trim()
            if (baseUrl.endsWith('/')) {
                baseUrl = baseUrl.slice(0, -1)
            }
            // Check if it already includes /api/webhook
            if (baseUrl.endsWith('/api/webhook')) {
                webhookUrl = baseUrl
            } else {
                webhookUrl = `${baseUrl}/api/webhook`
            }
            console.log('Using custom webhook URL:', webhookUrl)
        } else {
            // Check for tunnel URL in environment variable (e.g., ngrok)
            const tunnelUrl = process.env.NEXT_PUBLIC_WEBHOOK_TUNNEL_URL || process.env.WEBHOOK_TUNNEL_URL

            if (tunnelUrl) {
                // Use tunnel URL if provided (e.g., https://abc123.ngrok.io)
                let baseUrl = tunnelUrl.trim()
                if (baseUrl.endsWith('/')) {
                    baseUrl = baseUrl.slice(0, -1)
                }
                if (baseUrl.endsWith('/api/webhook')) {
                    webhookUrl = baseUrl
                } else {
                    webhookUrl = `${baseUrl}/api/webhook`
                }
                console.log('Using tunnel URL for webhook:', webhookUrl)
            } else if (isLocalhost) {
                // For localhost, default to production URL (or use tunnel)
                webhookUrl = `${APP_URL}/api/webhook`
                console.log('Localhost detected, using production webhook URL:', webhookUrl)
            } else {
                // Production environment
                webhookUrl = `${APP_URL}/api/webhook`
            }
        }

        // Subscribe to event streams we rely on
        // - chat.message.sent: ingest chat messages
        // - livestream.status.updated: authoritative start/end (prevents duration drift)
        // - livestream.metadata.updated: title/metadata changes (optional)
        const events: SubscribeEventRequest[] = [
            {
                name: 'chat.message.sent',
                version: 1,
            },
            {
                name: 'livestream.status.updated',
                version: 1,
            },
            {
                name: 'livestream.metadata.updated',
                version: 1,
            },
        ]

        const response = await fetch(`${KICK_API_BASE}/events/subscriptions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
                events,
                method: 'webhook',
                broadcaster_user_id: broadcasterUserId,
                webhook_url: webhookUrl,
            }),
        })

        if (!response.ok) {
            let errorText: string
            try {
                const errorData = await response.json()
                errorText = errorData.error || errorData.message || JSON.stringify(errorData)
            } catch {
                errorText = await response.text() || `HTTP ${response.status}`
            }
            console.error('Kick API subscription error:', response.status, errorText)
            return NextResponse.json(
                { error: `Failed to subscribe: ${errorText}`, status: response.status },
                { status: response.status }
            )
        }

        const data = await response.json()

        console.log('Subscription created successfully')
        console.log('Webhook URL registered:', webhookUrl)
        console.log('Subscription response:', JSON.stringify(data, null, 2))

        return NextResponse.json({
            success: true,
            subscriptions: data,
            message: 'Successfully subscribed to webhook events',
            webhookUrl: webhookUrl, // Include the webhook URL in response for debugging
        })
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return NextResponse.json(
            { error: 'Failed to subscribe to events', details: errorMessage },
            { status: 500 }
        )
    }
}

// GET endpoint to check existing subscriptions
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const accessToken = searchParams.get('accessToken')

        if (!accessToken) {
            return NextResponse.json(
                { error: 'Access token is required' },
                { status: 400 }
            )
        }

        const response = await fetch(`${KICK_API_BASE}/events/subscriptions`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        })

        if (!response.ok) {
            const errorText = await response.text()
            return NextResponse.json(
                { error: `Failed to fetch subscriptions: ${response.status} - ${errorText}` },
                { status: response.status }
            )
        }

        const data = await response.json()

        return NextResponse.json({
            subscriptions: data,
        })
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return NextResponse.json(
            { error: 'Failed to fetch subscriptions', details: errorMessage },
            { status: 500 }
        )
    }
}
