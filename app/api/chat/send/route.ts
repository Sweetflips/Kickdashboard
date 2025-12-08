import { NextResponse } from 'next/server'

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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/80522650-5b84-46a1-aef1-7229e5be0ce5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'chat/send/route.ts:sendMessageWithRetry',message:'Sending to Kick API',data:{tokenLength:accessToken?.length,tokenFirst20:accessToken?.substring(0,20),tokenLast10:accessToken?.substring(accessToken.length-10),broadcasterUserId,contentLength:content?.length,type},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,B,C,D'})}).catch(()=>{});
    // #endregion agent log
    
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
                    console.log(`⏳ Slow mode detected, retrying in ${SLOW_MODE_RETRY_DELAY}ms... (${MAX_SLOW_MODE_RETRIES - retries + 1}/${MAX_SLOW_MODE_RETRIES})`)
                    await sleep(SLOW_MODE_RETRY_DELAY)
                    return sendMessageWithRetry(accessToken, broadcasterUserId, content, type, retries - 1)
                } else {
                    console.error(`❌ Slow mode error: Max retries exceeded`)
                }
            }
        } catch {
            // Not JSON or can't parse, continue with normal error handling
        }
    }

    return response
}

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

        // #region agent log
        // Verify token by calling /users endpoint first to check validity
        const verifyResponse = await fetch(`${KICK_API_BASE}/users`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
        const verifyText = await verifyResponse.text();
        let verifyData: any = null;
        try { verifyData = JSON.parse(verifyText); } catch {}
        fetch('http://127.0.0.1:7242/ingest/80522650-5b84-46a1-aef1-7229e5be0ce5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'chat/send/route.ts:POST:tokenVerify',message:'Token verification via /users endpoint',data:{verifyStatus:verifyResponse.status,verifyOk:verifyResponse.ok,verifyUserId:verifyData?.data?.[0]?.user_id,verifyUsername:verifyData?.data?.[0]?.name,verifyError:verifyData?.message||verifyData?.error,broadcasterUserId},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,B,C'})}).catch(()=>{});
        // #endregion agent log

        // Send message to Kick API with slow mode retry logic
        const response = await sendMessageWithRetry(accessToken, broadcasterUserId, content, type)

        if (!response.ok) {
            const errorText = await response.text()
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/80522650-5b84-46a1-aef1-7229e5be0ce5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'chat/send/route.ts:POST:error',message:'Kick API error response',data:{status:response.status,errorText,broadcasterUserId,tokenLength:accessToken?.length,tokenFirst20:accessToken?.substring(0,20),responseHeaders:Object.fromEntries(response.headers.entries())},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,B,C,E'})}).catch(()=>{});
            // #endregion agent log
            console.error(`❌ Failed to send message: ${response.status} - ${errorText}`)
            console.error(`Request URL: ${KICK_API_BASE}/chat`)
            console.error(`Request body:`, JSON.stringify({
                broadcaster_user_id: broadcasterUserId,
                content: content.trim(),
                type: type,
            }))

            // Try to parse error response
            let errorDetails = errorText
            let isSlowMode = false
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

            return NextResponse.json(
                {
                    error: `Failed to send message: ${response.status}`,
                    details: errorDetails,
                    isSlowMode: isSlowMode,
                },
                { status: response.status }
            )
        }

        const data = await response.json()
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/80522650-5b84-46a1-aef1-7229e5be0ce5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'chat/send/route.ts:POST:success',message:'Message sent successfully',data:{responseData:data,broadcasterUserId},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'ALL'})}).catch(()=>{});
        // #endregion agent log
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
