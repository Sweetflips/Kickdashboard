import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const KICK_API_BASE = 'https://api.kick.com/public/v1'
const SLOW_MODE_RETRY_DELAY = 3000 // 3 seconds delay for slow mode
const MAX_SLOW_MODE_RETRIES = 2

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

async function sendMessageWithRetry(
    accessToken: string,
    broadcasterUserId: string,
    content: string,
    type: string,
    retries = MAX_SLOW_MODE_RETRIES
): Promise<Response> {
    const clientId = process.env.KICK_CLIENT_ID
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
    }

    // Add Client-Id header if available (required by Kick API for authenticated requests)
    if (clientId) {
        headers['Client-Id'] = clientId
    }

    const response = await fetch(`${KICK_API_BASE}/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            broadcaster_user_id: typeof broadcasterUserId === 'string' ? parseInt(broadcasterUserId, 10) : broadcasterUserId,
            content: content.trim(),
            type: type,
        }),
    })

    // Check for slow mode error
    if (!response.ok && response.status === 500) {
        const errorText = await response.text()
        try {
            const errorJson = JSON.parse(errorText)
            const errorData = errorJson.data || errorJson.error || ''

            // Check if it's a slow mode error
            if (typeof errorData === 'string' && errorData.includes('SLOW_MODE_ERROR')) {
                if (retries > 0) {
                    await sleep(SLOW_MODE_RETRY_DELAY)
                    return sendMessageWithRetry(accessToken, broadcasterUserId, content, type, retries - 1)
                }
            }
        } catch {
            // Not JSON or can't parse, continue with normal error handling
        }
    }

    return response
}

/**
 * Extract access token from request
 * Checks Authorization header first, then cookies, then body (deprecated)
 */
async function getAccessTokenFromRequest(request: Request, body?: any): Promise<string | null> {
    // Check Authorization header first
    const authHeader = request.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ')) {
        return authHeader.substring(7)
    }

    // Check cookies
    const cookieStore = cookies()
    const tokenFromCookie = cookieStore.get('kick_access_token')?.value
    if (tokenFromCookie) {
        return tokenFromCookie
    }

    // Fallback to body (deprecated, for backward compatibility)
    if (body?.accessToken) {
        return body.accessToken
    }

    return null
}

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { broadcasterUserId, content, type = 'user' } = body

        // Get access token from Authorization header, cookie, or body (deprecated)
        const accessToken = await getAccessTokenFromRequest(request, body)

        if (!accessToken) {
            return NextResponse.json(
                { error: 'Access token is required. Please authenticate with Kick.' },
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

        // Send message to Kick API with slow mode retry logic
        // Note: We no longer refresh broadcaster tokens on 401 - client must handle token refresh
        const response = await sendMessageWithRetry(accessToken, broadcasterUserId, content, type)

        if (!response.ok) {
            const errorText = await response.text()

            // Log errors - 403s are expected for expired tokens, use warn level
            if (response.status === 403) {
                console.warn(`⚠️ Chat 403 (likely expired token): ${errorText.substring(0, 100)}`)
            } else {
                console.error(`❌ Failed to send message: ${response.status} - ${errorText.substring(0, 200)}`)
            }

            // Try to parse error response
            let errorDetails = errorText
            let isSlowMode = false
            let requiresReauth = false
            try {
                const errorJson = JSON.parse(errorText)
                const errorData = errorJson.data || errorJson.error || ''
                errorDetails = errorJson.message || errorJson.error || errorText

                // Check if it's a slow mode error
                if (typeof errorData === 'string' && errorData.includes('SLOW_MODE_ERROR')) {
                    isSlowMode = true
                    errorDetails = 'Message sent too quickly. Please wait a moment before sending another message.'
                }
            } catch {
                // Keep original error text
            }

            // Handle 403 Forbidden - usually means token lacks permissions or user is muted/banned
            if (response.status === 403) {
                requiresReauth = true
                if (errorDetails === 'Forbidden' || errorDetails.includes('Forbidden')) {
                    errorDetails = 'Unable to send message. You may need to re-login or your chat permissions may be restricted.'
                }
            }

            return NextResponse.json(
                {
                    error: `Failed to send message: ${response.status}`,
                    details: errorDetails,
                    isSlowMode: isSlowMode,
                    requiresReauth: requiresReauth,
                },
                { status: response.status }
            )
        }

        const data = await response.json()

        return NextResponse.json({
            success: true,
            data: data,
            message: 'Message sent successfully',
        })
    } catch (error) {
        const err = error as any
        const errorMessage = err instanceof Error ? err.message : String(err ?? 'Unknown error')
        const errorName = err instanceof Error ? err.name : ''

        // Common when the browser navigates away / closes the request.
        if (
            errorName === 'AbortError' ||
            errorMessage.toLowerCase().includes('aborted') ||
            errorMessage.toLowerCase().includes('econnreset')
        ) {
            console.warn('Chat send API aborted by client:', errorMessage)
            return NextResponse.json(
                { error: 'Request aborted by client' },
                { status: 499 }
            )
        }

        console.error('Chat send API error:', errorMessage)
        return NextResponse.json(
            { error: 'Failed to send message', details: errorMessage },
            { status: 500 }
        )
    }
}
