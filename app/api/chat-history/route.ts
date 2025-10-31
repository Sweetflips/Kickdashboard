import { NextResponse } from 'next/server'

const KICK_API_BASE = 'https://kick.com/api'

/**
 * Fetch chat history from Kick's API
 * This endpoint tries to fetch chat messages even when offline
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const chatroomId = searchParams.get('chatroom_id')
        const slug = searchParams.get('slug') || 'sweetflips'

        console.log(`📡 Chat history request: chatroom_id=${chatroomId}, slug=${slug}`)

        if (!chatroomId) {
            console.log('⚠️ No chatroom_id provided, trying to fetch from channel data')
            // Try to get chatroom_id from channel data first
            try {
                const channelResponse = await fetch(`${KICK_API_BASE}/v2/channels/${slug}`)
                if (channelResponse.ok) {
                    const channelData = await channelResponse.json()
                    const extractedChatroomId = channelData.chatroom?.id || channelData.chatroom_id

                    if (extractedChatroomId) {
                        console.log(`📡 Found chatroom_id: ${extractedChatroomId} for channel ${slug}`)

                        // Try to fetch chat messages using chatroom_id
                        try {
                            const chatResponse = await fetch(`${KICK_API_BASE}/v2/channels/${slug}/chatroom/messages`)
                            if (chatResponse.ok) {
                                const chatData = await chatResponse.json()
                                console.log(`📨 Fetched ${chatData.messages?.length || 0} messages from Kick chat API`)
                                return NextResponse.json({
                                    success: true,
                                    messages: chatData.messages || chatData.data || [],
                                    source: 'kick_api',
                                })
                            } else {
                                console.log(`⚠️ Kick chat API returned ${chatResponse.status}`)
                            }
                        } catch (chatError) {
                            console.error('Failed to fetch chat messages:', chatError)
                        }
                    }
                }
            } catch (channelError) {
                console.error('Failed to fetch channel data:', channelError)
            }

            return NextResponse.json({
                success: false,
                error: 'chatroom_id is required',
                messages: [],
            }, { status: 400 })
        }

        // Try fetching chat messages using chatroom_id
        try {
            // Try multiple possible endpoints
            const endpoints = [
                `${KICK_API_BASE}/v2/chatrooms/${chatroomId}/messages`,
                `${KICK_API_BASE}/v2/channels/${slug}/chatroom/messages`,
                `${KICK_API_BASE}/v1/chatrooms/${chatroomId}/messages`,
                `https://kick.com/api/v2/channels/${slug}/chatroom`,
            ]

            for (const endpoint of endpoints) {
                try {
                    console.log(`🔍 Trying endpoint: ${endpoint}`)

                    // Add timeout to prevent hanging
                    const controller = new AbortController()
                    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

                    const chatResponse = await fetch(endpoint, {
                        headers: {
                            'Accept': 'application/json',
                        },
                        signal: controller.signal,
                    })

                    clearTimeout(timeoutId)

                    if (chatResponse.ok) {
                        const chatData = await chatResponse.json()
                        console.log(`✅ Success! Endpoint ${endpoint} returned data:`, JSON.stringify(chatData).substring(0, 200))

                        // Handle different response structures
                        let messages = []
                        if (Array.isArray(chatData)) {
                            messages = chatData
                        } else if (chatData.messages) {
                            messages = chatData.messages
                        } else if (chatData.data) {
                            messages = chatData.data
                        } else if (chatData.chatroom?.messages) {
                            messages = chatData.chatroom.messages
                        } else if (chatData.messages_list) {
                            messages = chatData.messages_list
                        }

                        console.log(`📨 Fetched ${messages.length} messages from Kick chat API`)

                        return NextResponse.json({
                            success: true,
                            messages: messages,
                            source: 'kick_api',
                            endpoint: endpoint,
                        })
                    } else {
                        const errorText = await chatResponse.text().catch(() => 'Unknown error')
                        console.log(`⚠️ Endpoint ${endpoint} returned ${chatResponse.status}: ${errorText.substring(0, 100)}`)
                    }
                } catch (endpointError) {
                    console.log(`⚠️ Endpoint ${endpoint} failed:`, endpointError instanceof Error ? endpointError.message : 'Unknown error')
                }
            }

            // If all endpoints failed, return empty but with info
            console.log(`⚠️ All endpoints failed for chatroom_id ${chatroomId}`)
            return NextResponse.json({
                success: false,
                error: 'No working endpoint found',
                messages: [],
            })

        } catch (error) {
            const errorMessage = error instanceof Error
                ? (error.name === 'AbortError' ? 'Request timed out' : error.message)
                : 'Unknown error'
            console.error('❌ Failed to fetch chat history from Kick:', errorMessage)
            if (error instanceof Error && error.stack) {
                console.error('Stack trace:', error.stack)
            }
            // Return success: false but with 200 status so client can handle gracefully
            return NextResponse.json({
                success: false,
                error: errorMessage,
                messages: [],
            })
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error('❌ Chat history API error:', errorMessage)
        if (error instanceof Error && error.stack) {
            console.error('Stack trace:', error.stack)
        }
        return NextResponse.json(
            { success: false, error: errorMessage, messages: [] },
            { status: 500 }
        )
    }
}
