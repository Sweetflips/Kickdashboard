import { redis } from './redis'
import type { ChatJobPayload } from './chat-queue'

const BUFFER_KEY = 'chat:buffer'
const FLUSH_INTERVAL_MS = 2000 // 2 seconds
const MAX_BUFFER_SIZE = 500

let flushInterval: NodeJS.Timeout | null = null
let isFlushing = false

/**
 * Buffer a chat message in Redis for batch processing
 * Returns immediately (< 1ms) - actual DB write happens in background
 */
export async function bufferMessage(payload: ChatJobPayload): Promise<{ success: boolean; error?: string }> {
  try {
    const serialized = JSON.stringify(payload)
    await redis.rpush(BUFFER_KEY, serialized)

    // Trigger flush if buffer is getting large
    const size = await redis.llen(BUFFER_KEY)
    if (size >= MAX_BUFFER_SIZE && !isFlushing) {
      // Trigger immediate flush (non-blocking)
      flushMessages().catch(err => {
        console.error('[message-buffer] Error in immediate flush:', err)
      })
    }

    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[message-buffer] Failed to buffer message:', errorMessage)
    return { success: false, error: errorMessage }
  }
}

/**
 * Flush buffered messages to PostgreSQL
 * Called periodically and when buffer is full
 */
export async function flushMessages(): Promise<number> {
  if (isFlushing) {
    return 0 // Already flushing
  }

  isFlushing = true
  try {
    // Atomically pop up to MAX_BUFFER_SIZE messages
    const messages = await redis.lpop(BUFFER_KEY, MAX_BUFFER_SIZE)

    if (!messages || messages.length === 0) {
      return 0
    }

    // Parse messages
    const parsed: ChatJobPayload[] = []
    for (const msg of messages) {
      try {
        parsed.push(JSON.parse(msg))
      } catch (e) {
        console.error('[message-buffer] Failed to parse message:', e)
      }
    }

    if (parsed.length === 0) {
      return 0
    }

    // Return parsed messages - actual DB write happens in redis-sync worker
    // This function just extracts from Redis
    return parsed.length
  } catch (error) {
    console.error('[message-buffer] Error flushing messages:', error)
    return 0
  } finally {
    isFlushing = false
  }
}

/**
 * Get buffered messages without removing them (for sync worker)
 */
export async function peekMessages(count: number = MAX_BUFFER_SIZE): Promise<ChatJobPayload[]> {
  try {
    // Use LRANGE to peek without removing
    const messages = await redis.lrange(BUFFER_KEY, 0, count - 1)

    const parsed: ChatJobPayload[] = []
    for (const msg of messages) {
      try {
        parsed.push(JSON.parse(msg))
      } catch (e) {
        console.error('[message-buffer] Failed to parse message:', e)
      }
    }

    return parsed
  } catch (error) {
    console.error('[message-buffer] Error peeking messages:', error)
    return []
  }
}

/**
 * Remove messages from buffer after successful processing
 */
export async function removeMessages(count: number): Promise<void> {
  try {
    await redis.ltrim(BUFFER_KEY, count, -1)
  } catch (error) {
    console.error('[message-buffer] Error removing messages:', error)
  }
}

/**
 * Get current buffer size
 */
export async function getBufferSize(): Promise<number> {
  try {
    return await redis.llen(BUFFER_KEY)
  } catch (error) {
    console.error('[message-buffer] Error getting buffer size:', error)
    return 0
  }
}

/**
 * Start periodic flush (called by sync worker)
 */
export function startPeriodicFlush(flushCallback: (messages: ChatJobPayload[]) => Promise<void>): void {
  if (flushInterval) {
    return // Already started
  }

  flushInterval = setInterval(async () => {
    try {
      const size = await getBufferSize()
      if (size === 0) {
        return
      }

      const messages = await peekMessages(MAX_BUFFER_SIZE)
      if (messages.length > 0) {
        await flushCallback(messages)
        // Remove processed messages
        await removeMessages(messages.length)
      }
    } catch (error) {
      console.error('[message-buffer] Error in periodic flush:', error)
    }
  }, FLUSH_INTERVAL_MS)

  console.log(`[message-buffer] Started periodic flush every ${FLUSH_INTERVAL_MS}ms`)
}

/**
 * Stop periodic flush
 */
export function stopPeriodicFlush(): void {
  if (flushInterval) {
    clearInterval(flushInterval)
    flushInterval = null
    console.log('[message-buffer] Stopped periodic flush')
  }
}
