#!/usr/bin/env node
/**
 * Test script for Razed Worker
 * 
 * Tests:
 * 1. WebSocket connection to Razed chat
 * 2. Socket.IO message parsing
 * 3. Chat message reception
 * 
 * Usage: npx tsx scripts/test-razed-worker.ts
 */

import WebSocket from 'ws'

const RAZED_WS_URL = 'wss://chat-be.razed.com/socket.io/?EIO=4&transport=websocket'

console.log('')
console.log('========================================')
console.log('🧪 TESTING RAZED WORKER (LONG RUN)')
console.log('========================================')
console.log('')
console.log(`Connecting to: ${RAZED_WS_URL}`)
console.log('⏱️  Running indefinitely - Press Ctrl+C to stop')
console.log('📝 Watch for chat messages in Razed and compare with WebSocket output')
console.log('')

let messageCount = 0
let eventCount = 0
let errorCount = 0
let startTime = Date.now()
let ws: WebSocket | null = null
let pingInterval: NodeJS.Timeout | null = null
let statusInterval: NodeJS.Timeout | null = null
let isShuttingDown = false

/**
 * Parse Socket.IO protocol message
 */
function parseSocketIOMessage(data: string): { event: string; payload: any } | null {
    try {
        if (data.startsWith('40')) {
            // Connection acknowledgment
            return null
        }
        
        if (data.startsWith('42')) {
            // Event message: 42["eventName", payload]
            const jsonStr = data.substring(2)
            const parsed = JSON.parse(jsonStr)
            
            if (Array.isArray(parsed) && parsed.length >= 2) {
                return {
                    event: parsed[0],
                    payload: parsed[1]
                }
            }
        }
        
        return null
    } catch (error) {
        console.error('[TEST] Error parsing Socket.IO message:', error)
        return null
    }
}

function connect(): void {
    console.log('[TEST] Connecting to WebSocket...')
    
    ws = new WebSocket(RAZED_WS_URL, {
        headers: {
            'Origin': 'https://www.razed.com',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    })
    
    ws.on('open', () => {
        console.log('[TEST] ✅ WebSocket connected successfully')
        console.log('')
        
        // Send Socket.IO connect packet (40)
        ws!.send('40')
        console.log('[TEST] Sent connect packet (40)')
        
        // Try to subscribe to channel 3 (main chat) after a short delay
        // Socket.IO format: 42["event", data]
        setTimeout(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                // Try joining channel 3 (common default channel)
                const joinMessage = JSON.stringify(['join', { channel_id: 3 }])
                ws.send(`42${joinMessage}`)
                console.log('[TEST] Attempted to join channel 3')
                
                // Also try subscribing to messages
                const subscribeMessage = JSON.stringify(['subscribe', 'messages'])
                ws.send(`42${subscribeMessage}`)
                console.log('[TEST] Attempted to subscribe to messages')
                console.log('')
                console.log('⏳ Waiting for chat messages...')
                console.log('   (Send a message in Razed chat to test)')
                console.log('')
            }
        }, 1000)
        
        // Note: Server handles ping/pong automatically (pingInterval: 10000ms from connection ack)
        // We just need to respond to server's "2" ping with "3" pong (handled in message handler)
        
        // Start status reporting interval (every 30 seconds)
        statusInterval = setInterval(() => {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(0)
            console.log(`[TEST] ⏱️  Running for ${elapsed}s | Events: ${eventCount} | Messages: ${messageCount} | Errors: ${errorCount}`)
        }, 30000)
    })
        
        ws.on('message', (data: WebSocket.Data) => {
            try {
                const messageStr = data.toString()
                
                // Handle Socket.IO ping/pong protocol
                // Server sends "2" as ping, we respond with "3" as pong
                if (messageStr === '2') {
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send('3') // Send pong response
                    }
                    return
                }
                
                // "3" is pong response from server (can be ignored)
                if (messageStr === '3') {
                    return
                }
                
                // Parse Socket.IO message
                const parsed = parseSocketIOMessage(messageStr)
                
                if (parsed) {
                    eventCount++
                    
                    if (parsed.event === 'messages created') {
                        messageCount++
                        const msg = parsed.payload
                        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
                        console.log('')
                        console.log(`[TEST] 🎉 📨 MESSAGE #${messageCount} RECEIVED (${elapsed}s):`)
                        console.log(`       Username: ${msg.sender?.username || 'N/A'}`)
                        console.log(`       Text: ${msg.text || 'N/A'}`)
                        console.log(`       Channel ID: ${msg.channel_id || 'N/A'}`)
                        console.log(`       Player ID: ${msg.player_id || 'N/A'}`)
                        console.log(`       Full payload: ${JSON.stringify(msg, null, 2)}`)
                        console.log('')
                    } else {
                        // Only log non-message events occasionally to reduce noise
                        if (eventCount <= 5 || parsed.event !== 'count') {
                            console.log(`[TEST] 📡 Event: ${parsed.event}`)
                            if (parsed.event === 'count' && messageCount === 0) {
                                console.log(`       Payload: ${JSON.stringify(parsed.payload).substring(0, 100)}...`)
                            }
                        }
                    }
                } else if (messageStr.startsWith('40')) {
                    console.log('[TEST] ✅ Received connection acknowledgment')
                } else {
                    console.log(`[TEST] 📦 Raw message: ${messageStr.substring(0, 100)}...`)
                }
            } catch (error) {
                errorCount++
                console.error('[TEST] ❌ Error processing message:', error)
            }
        })
        
        ws.on('error', (error) => {
            errorCount++
            console.error('[TEST] ❌ WebSocket error:', error.message)
        })
        
    ws.on('close', (code, reason) => {
        const reasonStr = reason ? reason.toString() : 'No reason provided'
        console.log(`[TEST] WebSocket connection closed (code: ${code}, reason: ${reasonStr})`)
        if (!isShuttingDown) {
            console.log('[TEST] Attempting to reconnect in 5 seconds...')
            setTimeout(() => connect(), 5000)
        }
    })
}

function shutdown() {
    if (isShuttingDown) return
    
    isShuttingDown = true
    console.log('')
    console.log('')
    console.log('========================================')
    console.log('🛑 SHUTTING DOWN')
    console.log('========================================')
    console.log('')
    
    if (statusInterval) {
        clearInterval(statusInterval)
    }
    
    if (pingInterval) {
        clearInterval(pingInterval)
    }
    
    if (ws) {
        ws.close()
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1)
    
    console.log('📊 FINAL RESULTS:')
    console.log(`   Duration: ${duration} seconds`)
    console.log(`   Events received: ${eventCount}`)
    console.log(`   Chat messages: ${messageCount}`)
    console.log(`   Errors: ${errorCount}`)
    console.log('')
    
    if (messageCount > 0) {
        console.log('✅ SUCCESS: Worker received chat messages!')
    } else {
        console.log('⚠️  No chat messages received during test period')
        console.log('   This could mean:')
        console.log('   - Chat was quiet during the test')
        console.log('   - Need to subscribe to a specific channel')
        console.log('   - Messages are sent to a different event name')
    }
    
    console.log('')
    process.exit(0)
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('')
    console.log('[TEST] Received SIGINT (Ctrl+C)')
    shutdown()
})

process.on('SIGTERM', () => {
    shutdown()
})

// Start the test
connect()

