#!/usr/bin/env node
/**
 * Backfill derived analytics fields for chat messages.
 *
 * Runs with plain Node (no tsx/ts-node needed):
 *   node scripts/backfill-chat-analytics.js
 *
 * Optional env:
 *   BACKFILL_START_ID=12345
 *   BACKFILL_BATCH_SIZE=1000
 *   BACKFILL_CONCURRENCY=25
 */

const { PrismaClient } = require('@prisma/client')

const BATCH_SIZE = Math.max(1, parseInt(process.env.BACKFILL_BATCH_SIZE || '1000', 10) || 1000)
const CONCURRENCY = Math.max(1, parseInt(process.env.BACKFILL_CONCURRENCY || '25', 10) || 25)

function getDatabaseUrl() {
  const url = process.env.DATABASE_URL || ''
  if (url && !url.includes('connection_limit=')) {
    const separator = url.includes('?') ? '&' : '?'
    const isWorker = process.env.POINT_WORKER === 'true' || (process.env.RAILWAY_SERVICE_NAME || '').includes('worker')
    const connectionLimit = isWorker ? 10 : 20
    return `${url}${separator}connection_limit=${connectionLimit}&pool_timeout=30&connect_timeout=10`
  }
  return url
}

const db = new PrismaClient({
  log: [],
  datasources: { db: { url: getDatabaseUrl() } },
  transactionOptions: { maxWait: 5000, timeout: 15000 },
})

function pLimit(concurrency) {
  let activeCount = 0
  const queue = []

  const next = () => {
    activeCount--
    if (queue.length > 0) queue.shift()()
  }

  const run = async (fn) => {
    activeCount++
    try {
      return await fn()
    } finally {
      next()
    }
  }

  return (fn) =>
    new Promise((resolve, reject) => {
      const task = () => run(fn).then(resolve, reject)
      if (activeCount < concurrency) task()
      else queue.push(task)
    })
}

function countExclamations(content) {
  const matches = String(content || '').match(/!/g)
  return matches ? matches.length : 0
}

function countSentences(content) {
  const matches = String(content || '').match(/[.!?]+/g)
  return matches ? matches.length : 0
}

function messageLength(content) {
  return String(content || '').length
}

function extractEmotesFromContent(content) {
  const emotePattern = /\[emote:(\d+):([^\]]+)\]/g
  const emotesMap = new Map()

  let match
  const text = String(content || '')
  while ((match = emotePattern.exec(text)) !== null) {
    const emoteId = match[1]
    const start = match.index
    const end = start + match[0].length - 1
    if (!emotesMap.has(emoteId)) emotesMap.set(emoteId, [])
    emotesMap.get(emoteId).push({ s: start, e: end })
  }

  return Array.from(emotesMap.entries()).map(([emote_id, positions]) => ({ emote_id, positions }))
}

function hasEmotes(emotes, content) {
  if (Array.isArray(emotes) && emotes.length > 0) return true
  if (typeof emotes === 'string') {
    try {
      const parsed = JSON.parse(emotes)
      if (Array.isArray(parsed) && parsed.length > 0) return true
    } catch {
      // ignore
    }
  }
  return extractEmotesFromContent(content).length > 0
}

function analyzeEngagementType(content, hasEmotesFlag) {
  const text = String(content || '').trim().toLowerCase()
  const length = text.length

  if (text.startsWith('!')) return 'command'
  if (
    text.includes('?') ||
    text.startsWith('what') ||
    text.startsWith('why') ||
    text.startsWith('how') ||
    text.startsWith('when') ||
    text.startsWith('where') ||
    text.startsWith('who')
  ) {
    return 'question'
  }

  if (length <= 5 && hasEmotesFlag) return 'reaction'
  if (length <= 10 && !hasEmotesFlag) return 'short_message'
  if (countExclamations(content) >= 2) return 'enthusiastic'
  if (length > 100) return 'conversation'
  if (countSentences(content) >= 2) return 'discussion'
  if (hasEmotesFlag && length <= 20) return 'emote_response'
  return 'regular'
}

async function backfillChatMessages(startId) {
  let lastId = startId
  let processed = 0
  const limit = pLimit(CONCURRENCY)

  while (true) {
    const batch = await db.chatMessage.findMany({
      where: { id: { gt: lastId } },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      select: { id: true, content: true, emotes: true },
    })

    if (batch.length === 0) break

    await Promise.all(
      batch.map((row) =>
        limit(async () => {
          const derivedHasEmotes = hasEmotes(row.emotes, row.content)
          const derivedEngagementType = analyzeEngagementType(row.content, derivedHasEmotes)
          const derivedLength = messageLength(row.content)
          const derivedExclamations = countExclamations(row.content)
          const derivedSentences = countSentences(row.content)

          await db.chatMessage.update({
            where: { id: row.id },
            data: {
              has_emotes: derivedHasEmotes,
              engagement_type: derivedEngagementType,
              message_length: derivedLength,
              exclamation_count: derivedExclamations,
              sentence_count: derivedSentences,
            },
          })
        })
      )
    )

    lastId = batch[batch.length - 1].id
    processed += batch.length
    if (processed % (BATCH_SIZE * 5) === 0) {
      console.log(`[backfill-chat-analytics] chat_messages processed=${processed}, lastId=${lastId.toString()}`)
    }
  }

  console.log(`[backfill-chat-analytics] chat_messages done. processed=${processed}, lastId=${lastId.toString()}`)
}

async function backfillOfflineChatMessages(startId) {
  let lastId = startId
  let processed = 0
  const limit = pLimit(CONCURRENCY)

  while (true) {
    const batch = await db.offlineChatMessage.findMany({
      where: { id: { gt: lastId } },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      select: { id: true, content: true, emotes: true },
    })

    if (batch.length === 0) break

    await Promise.all(
      batch.map((row) =>
        limit(async () => {
          const derivedHasEmotes = hasEmotes(row.emotes, row.content)
          const derivedEngagementType = analyzeEngagementType(row.content, derivedHasEmotes)
          const derivedLength = messageLength(row.content)
          const derivedExclamations = countExclamations(row.content)
          const derivedSentences = countSentences(row.content)

          await db.offlineChatMessage.update({
            where: { id: row.id },
            data: {
              has_emotes: derivedHasEmotes,
              engagement_type: derivedEngagementType,
              message_length: derivedLength,
              exclamation_count: derivedExclamations,
              sentence_count: derivedSentences,
            },
          })
        })
      )
    )

    lastId = batch[batch.length - 1].id
    processed += batch.length
    if (processed % (BATCH_SIZE * 5) === 0) {
      console.log(`[backfill-chat-analytics] offline_chat_messages processed=${processed}, lastId=${lastId.toString()}`)
    }
  }

  console.log(`[backfill-chat-analytics] offline_chat_messages done. processed=${processed}, lastId=${lastId.toString()}`)
}

async function main() {
  const start = process.env.BACKFILL_START_ID ? BigInt(process.env.BACKFILL_START_ID) : BigInt(0)
  console.log(`[backfill-chat-analytics] starting startId=${start.toString()} batchSize=${BATCH_SIZE} concurrency=${CONCURRENCY}`)

  await backfillChatMessages(start)
  await backfillOfflineChatMessages(start)
}

main()
  .catch((err) => {
    console.error('[backfill-chat-analytics] failed:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect().catch(() => {})
  })












