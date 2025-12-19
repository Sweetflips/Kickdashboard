#!/usr/bin/env node
/**
 * REDIS SYNC WORKER
 *
 * Periodically syncs Redis data to PostgreSQL:
 * - Flushes message buffer every 2 seconds
 * - Syncs sweet coin balances every 30 seconds
 * - Records sweet_coin_history for audit trail
 */

console.log('')
console.log('========================================')
console.log('🔄 REDIS SYNC WORKER STARTING')
console.log('========================================')
console.log('')

import { db } from '../lib/db'
import { redis, checkRedisHealth } from '../lib/redis'
import { peekMessages, removeMessages, getBufferSize } from '../lib/message-buffer'
import { getAllBalances, getSessionEarningsForSync } from '../lib/sweet-coins-redis'
import type { ChatJobPayload } from '../lib/chat-queue'
import { analyzeEngagementType, countExclamations, countSentences, hasEmotes, messageLength } from '../lib/analytics-classifier'

const MESSAGE_FLUSH_INTERVAL_MS = 2000 // 2 seconds
const COIN_SYNC_INTERVAL_MS = 30000 // 30 seconds
const MAX_BATCH_SIZE = 500

let isShuttingDown = false
let messageFlushInterval: NodeJS.Timeout | null = null
let coinSyncInterval: NodeJS.Timeout | null = null

// Stats tracking
let messagesFlushed = 0
let coinsSynced = 0
let errors = 0

/**
 * Process and save a batch of messages to PostgreSQL
 */
async function flushMessages(): Promise<void> {
  try {
    const bufferSize = await getBufferSize()
    if (bufferSize === 0) {
      return
    }

    // Peek messages without removing
    const messages = await peekMessages(MAX_BATCH_SIZE)
    if (messages.length === 0) {
      return
    }

    console.log(`[redis-sync] Flushing ${messages.length} messages to PostgreSQL...`)

    // Process messages in batches
    const batchSize = 100
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize)
      await processMessageBatch(batch)
    }

    // Remove processed messages from Redis
    await removeMessages(messages.length)
    messagesFlushed += messages.length

    console.log(`[redis-sync] ✅ Flushed ${messages.length} messages (total: ${messagesFlushed})`)
  } catch (error) {
    errors++
    console.error('[redis-sync] Error flushing messages:', error)
  }
}

/**
 * Process a batch of messages (similar to chat-worker logic)
 */
async function processMessageBatch(messages: ChatJobPayload[]): Promise<void> {
  // Group by broadcaster for efficient user lookups
  const broadcasterMap = new Map<bigint, Set<bigint>>()
  for (const msg of messages) {
    const broadcasterId = BigInt(msg.broadcaster.kick_user_id)
    const senderId = BigInt(msg.sender.kick_user_id)

    if (!broadcasterMap.has(broadcasterId)) {
      broadcasterMap.set(broadcasterId, new Set())
    }
    broadcasterMap.get(broadcasterId)!.add(senderId)
    broadcasterMap.get(broadcasterId)!.add(broadcasterId)
  }

  // Batch fetch users and create missing ones
  const allUserIds = Array.from(new Set(Array.from(broadcasterMap.values()).flatMap(s => Array.from(s))))
  const users = await db.user.findMany({
    where: { kick_user_id: { in: allUserIds } },
    select: { id: true, kick_user_id: true },
  })

  const userIdMap = new Map<bigint, bigint>()
  for (const user of users) {
    userIdMap.set(user.kick_user_id, user.id)
  }

  // Create missing users (from messages)
  for (const payload of messages) {
    const senderKickId = BigInt(payload.sender.kick_user_id)
    const broadcasterKickId = BigInt(payload.broadcaster.kick_user_id)

    if (!userIdMap.has(senderKickId)) {
      try {
        const newUser = await db.user.upsert({
          where: { kick_user_id: senderKickId },
          update: { username: payload.sender.username },
          create: {
            kick_user_id: senderKickId,
            username: payload.sender.username,
            profile_picture_url: payload.sender.profile_picture || null,
          },
          select: { id: true },
        })
        userIdMap.set(senderKickId, newUser.id)
      } catch (error) {
        console.error(`[redis-sync] Error creating sender user ${senderKickId}:`, error)
      }
    }

    if (!userIdMap.has(broadcasterKickId)) {
      try {
        const newUser = await db.user.upsert({
          where: { kick_user_id: broadcasterKickId },
          update: { username: payload.broadcaster.username },
          create: {
            kick_user_id: broadcasterKickId,
            username: payload.broadcaster.username,
            profile_picture_url: payload.broadcaster.profile_picture || null,
          },
          select: { id: true },
        })
        userIdMap.set(broadcasterKickId, newUser.id)
      } catch (error) {
        console.error(`[redis-sync] Error creating broadcaster user ${broadcasterKickId}:`, error)
      }
    }
  }

  // Process messages
  const chatMessageInserts: any[] = []
  const offlineMessageInserts: any[] = []

  for (const payload of messages) {
    const senderUserId = userIdMap.get(BigInt(payload.sender.kick_user_id))
    const broadcasterUserId = userIdMap.get(BigInt(payload.broadcaster.kick_user_id))

    if (!senderUserId || !broadcasterUserId) {
      continue // Skip if user not found
    }

    const derivedHasEmotes = hasEmotes(payload.emotes, payload.content)
    const derivedEngagementType = analyzeEngagementType(payload.content, derivedHasEmotes)
    const derivedLength = messageLength(payload.content)
    const derivedExclamations = countExclamations(payload.content)
    const derivedSentences = countSentences(payload.content)

    const sentWhenOffline = !payload.stream_session_id || !payload.is_stream_active

    const messageData = {
      message_id: payload.message_id,
      stream_session_id: payload.stream_session_id,
      sender_user_id: senderUserId,
      sender_username: payload.sender.username,
      broadcaster_user_id: broadcasterUserId,
      content: payload.content,
      emotes: payload.emotes || undefined,
      has_emotes: derivedHasEmotes,
      engagement_type: derivedEngagementType,
      message_length: derivedLength,
      exclamation_count: derivedExclamations,
      sentence_count: derivedSentences,
      timestamp: BigInt(payload.timestamp),
      sender_username_color: payload.sender.color || null,
      sender_badges: payload.sender.badges || undefined,
      sender_is_verified: payload.sender.is_verified || false,
      sender_is_anonymous: payload.sender.is_anonymous || false,
      sweet_coins_earned: 0, // Will be updated by coin sync
      sent_when_offline: sentWhenOffline,
    }

    if (sentWhenOffline) {
      offlineMessageInserts.push(messageData)
    } else {
      chatMessageInserts.push(messageData)
    }
  }

  // Batch insert using createMany with skipDuplicates
  if (chatMessageInserts.length > 0) {
    await db.chatMessage.createMany({
      data: chatMessageInserts,
      skipDuplicates: true,
    })
  }

  if (offlineMessageInserts.length > 0) {
    await db.offlineChatMessage.createMany({
      data: offlineMessageInserts,
      skipDuplicates: true,
    })
  }
}

/**
 * Sync sweet coin balances from Redis to PostgreSQL
 */
async function syncCoins(): Promise<void> {
  try {
    console.log('[redis-sync] Syncing sweet coin balances...')

    // Get all balances from Redis
    const balances = await getAllBalances()
    if (balances.length === 0) {
      return
    }

    // Batch update PostgreSQL
    for (const { userId, balance } of balances) {
      try {
        // Get user's internal ID
        const user = await db.user.findUnique({
          where: { id: userId },
          select: { id: true },
        })

        if (!user) {
          continue
        }

        // Update or create user_sweet_coins record
        await db.userSweetCoins.upsert({
          where: { user_id: userId },
          update: {
            total_sweet_coins: balance,
            updated_at: new Date(),
          },
          create: {
            user_id: userId,
            total_sweet_coins: balance,
            total_emotes: 0,
          },
        })
      } catch (error) {
        console.error(`[redis-sync] Error syncing balance for user ${userId}:`, error)
      }
    }

    // Note: Individual message-level history is not tracked in Redis
    // Only total balances and session totals are synced
    // History records can be created from chat_messages table if needed

    coinsSynced += balances.length
    console.log(`[redis-sync] ✅ Synced ${balances.length} coin balances (total: ${coinsSynced})`)
  } catch (error) {
    errors++
    console.error('[redis-sync] Error syncing coins:', error)
  }
}

/**
 * Main sync loop
 */
async function runSync(): Promise<void> {
  console.log('[redis-sync] Starting Redis sync worker')
  console.log(`[redis-sync] Message flush interval: ${MESSAGE_FLUSH_INTERVAL_MS}ms`)
  console.log(`[redis-sync] Coin sync interval: ${COIN_SYNC_INTERVAL_MS}ms`)

  // Check Redis health
  const redisHealthy = await checkRedisHealth()
  if (!redisHealthy) {
    console.error('[redis-sync] ❌ Redis health check failed - exiting')
    process.exit(1)
  }

  // Start message flush interval
  messageFlushInterval = setInterval(() => {
    if (!isShuttingDown) {
      flushMessages().catch(err => {
        console.error('[redis-sync] Error in message flush:', err)
      })
    }
  }, MESSAGE_FLUSH_INTERVAL_MS)

  // Start coin sync interval
  coinSyncInterval = setInterval(() => {
    if (!isShuttingDown) {
      syncCoins().catch(err => {
        console.error('[redis-sync] Error in coin sync:', err)
      })
    }
  }, COIN_SYNC_INTERVAL_MS)

  // Initial flush
  await flushMessages()

  // Initial sync
  await syncCoins()

  console.log('[redis-sync] ✅ Sync worker started')
}

/**
 * Graceful shutdown
 */
async function shutdown(signal: string): Promise<void> {
  console.log(`[redis-sync] ${signal} received, shutting down...`)
  isShuttingDown = true

  if (messageFlushInterval) {
    clearInterval(messageFlushInterval)
  }
  if (coinSyncInterval) {
    clearInterval(coinSyncInterval)
  }

  // Final flush
  console.log('[redis-sync] Performing final flush...')
  await flushMessages()
  await syncCoins()

  console.log(`[redis-sync] Shutdown complete (messages: ${messagesFlushed}, coins: ${coinsSynced}, errors: ${errors})`)
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

// Start the sync worker
runSync().catch(async (error) => {
  console.error('[redis-sync] Fatal error:', error)
  await shutdown('FATAL_ERROR')
  process.exit(1)
})
