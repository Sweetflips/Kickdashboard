#!/usr/bin/env node
/**
 * RAZED WORKER - Monitors Razed chat for verification codes
 *
 * This worker connects to Razed's WebSocket chat server and listens for
 * messages containing verification codes. When a code is found, it verifies
 * the user's account.
 */

console.log('')
console.log('========================================')
console.log('🎮 RAZED WORKER STARTING')
console.log('========================================')
console.log('')

import { db } from '../lib/db'
import { extractVerificationCode, isValidVerificationCode } from '../lib/razed-verification'
import WebSocket from 'ws'

const RAZED_WS_URL = 'wss://chat-be.razed.com/socket.io/?EIO=4&transport=websocket'
const RECONNECT_DELAY_MS = 5000
const MAX_RECONNECT_DELAY_MS = 60000
const PING_INTERVAL_MS = 25000

let ws: WebSocket | null = null
let reconnectTimeout: NodeJS.Timeout | null = null
let pingInterval: NodeJS.Timeout | null = null
let reconnectAttempts = 0
let isShuttingDown = false

interface RazedMessage {
    id: number
    channel_id: number
    player_id: number
    user_id: number | null
    text: string
    sender: {
        id: number
        user_id: number
        username: string
    }
    created_at: string
    message_type: string
}

/**
 * Parse Socket.IO protocol message
 * Format: 42["eventName", data]
 */
function parseSocketIOMessage(data: string): { event: string; payload: any } | null {
    try {
        // Socket.IO packet format: <packet_type><namespace><data>
        // Packet type 4 = EVENT, 0 = CONNECT
        if (data.startsWith('40')) {
            // Connection acknowledgment
            return null
        }
        
        if (data.startsWith('42')) {
            // Event message: 42["eventName", payload]
            const jsonStr = data.substring(2) // Remove "42" prefix
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
        console.error('[razed-worker] Error parsing Socket.IO message:', error)
        return null
    }
}

/**
 * Handle incoming chat message
 */
async function handleChatMessage(message: RazedMessage): Promise<void> {
    try {
        const username = message.sender?.username?.toLowerCase()
        const text = message.text?.trim()
        
        if (!username || !text) {
            return
        }
        
        // Extract verification code from message
        const verificationCode = extractVerificationCode(text)
        
        if (!verificationCode) {
            return
        }
        
        console.log(`[razed-worker] Found verification code "${verificationCode}" from user "${username}"`)
        
        // Find pending verification
        const verification = await (db as any).razedVerification.findUnique({
            where: { verification_code: verificationCode },
            select: {
                id: true,
                kick_user_id: true,
                razed_username: true,
                status: true,
                expires_at: true
            }
        })
        
        if (!verification) {
            console.log(`[razed-worker] No verification found for code "${verificationCode}"`)
            return
        }
        
        if (verification.status !== 'pending') {
            console.log(`[razed-worker] Verification "${verificationCode}" already processed (status: ${verification.status})`)
            return
        }
        
        // Check expiration
        const now = new Date()
        if (now > verification.expires_at) {
            console.log(`[razed-worker] Verification "${verificationCode}" expired`)
            await (db as any).razedVerification.update({
                where: { id: verification.id },
                data: { status: 'expired' }
            })
            return
        }
        
        // Verify username matches (case-insensitive)
        if (username !== verification.razed_username.toLowerCase()) {
            console.log(`[razed-worker] Username mismatch: expected "${verification.razed_username}", got "${username}"`)
            return
        }
        
        // Update verification status
        await (db as any).razedVerification.update({
            where: { id: verification.id },
            data: {
                status: 'verified',
                verified_at: now
            }
        })
        
        // Update user's Razed connection
        await (db as any).user.update({
            where: { kick_user_id: verification.kick_user_id },
            data: {
                razed_connected: true,
                razed_username: message.sender.username,
                razed_user_id: message.sender.user_id.toString()
            }
        })
        
        console.log(`[razed-worker] ✅ Verified Razed account "${username}" for kick_user_id ${verification.kick_user_id}`)
        
    } catch (error) {
        console.error('[razed-worker] Error handling chat message:', error)
    }
}

/**
 * Connect to Razed WebSocket
 */
function connect(): void {
    if (isShuttingDown) {
        return
    }
    
    console.log(`[razed-worker] Connecting to Razed WebSocket...`)
    
    try {
        ws = new WebSocket(RAZED_WS_URL, {
            headers: {
                'Origin': 'https://www.razed.com',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36'
            }
        })
        
        ws.on('open', () => {
            console.log('[razed-worker] ✅ Connected to Razed WebSocket')
            reconnectAttempts = 0
            
            // Send Socket.IO connect packet (40)
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send('40')
            }
            
            // After connection, try to subscribe to channels
            // Wait a bit for connection to be fully established
            setTimeout(() => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    // Try subscribing to channel 3 (main chat channel based on user's example)
                    // Socket.IO format: 42["event", data]
                    try {
                        const subscribeMessage = JSON.stringify(['subscribe', { channel_id: 3 }])
                        ws.send(`42${subscribeMessage}`)
                        console.log('[razed-worker] Attempted to subscribe to channel 3')
                    } catch (error) {
                        console.error('[razed-worker] Error sending subscribe message:', error)
                    }
                }
            }, 1000)
            
            // Note: Server handles ping/pong automatically (pingInterval: 10000ms from connection ack)
            // We just need to respond to server's "2" ping with "3" pong (handled in message handler)
            // Keep pingInterval variable for cleanup, but don't set it
            pingInterval = null
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
                
                // Parse Socket.IO event message
                const parsed = parseSocketIOMessage(messageStr)
                
                if (parsed) {
                    if (parsed.event === 'messages created') {
                        const message = parsed.payload as RazedMessage
                        handleChatMessage(message).catch(err => {
                            console.error('[razed-worker] Error processing message:', err)
                        })
                    } else {
                        // Log other events for debugging (but limit frequency)
                        const now = Date.now()
                        if (!(global as any).lastEventLog || now - (global as any).lastEventLog > 60000) {
                            console.log(`[razed-worker] Received event: ${parsed.event}`)
                            ;(global as any).lastEventLog = now
                        }
                    }
                }
            } catch (error) {
                console.error('[razed-worker] Error processing WebSocket message:', error)
            }
        })
        
        ws.on('error', (error) => {
            console.error('[razed-worker] WebSocket error:', error.message)
        })
        
        ws.on('close', (code, reason) => {
            const reasonStr = reason ? reason.toString() : 'No reason provided'
            console.log(`[razed-worker] WebSocket connection closed (code: ${code}, reason: ${reasonStr})`)
            
            if (pingInterval) {
                clearInterval(pingInterval)
                pingInterval = null
            }
            
            if (!isShuttingDown) {
                scheduleReconnect()
            }
        })
        
    } catch (error) {
        console.error('[razed-worker] Error connecting:', error)
        scheduleReconnect()
    }
}

/**
 * Schedule reconnection with exponential backoff
 */
function scheduleReconnect(): void {
    if (isShuttingDown) {
        return
    }
    
    reconnectAttempts++
    const delay = Math.min(RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts - 1), MAX_RECONNECT_DELAY_MS)
    
    console.log(`[razed-worker] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})...`)
    
    reconnectTimeout = setTimeout(() => {
        connect()
    }, delay)
}

/**
 * Cleanup and shutdown
 */
function shutdown(): void {
    console.log('[razed-worker] Shutting down...')
    isShuttingDown = true
    
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout)
        reconnectTimeout = null
    }
    
    if (pingInterval) {
        clearInterval(pingInterval)
        pingInterval = null
    }
    
    if (ws) {
        ws.removeAllListeners()
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close()
        }
        ws = null
    }
    
    console.log('[razed-worker] Shutdown complete')
    process.exit(0)
}

// Handle graceful shutdown
process.on('SIGTERM', () => shutdown())
process.on('SIGINT', () => shutdown())

// Start connection
connect()

