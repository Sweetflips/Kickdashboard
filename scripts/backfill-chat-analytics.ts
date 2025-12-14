#!/usr/bin/env node
/**
 * Backfill derived analytics fields for chat messages.
 *
 * Usage:
 *   node scripts/backfill-chat-analytics.ts
 *
 * Optional env:
 *   BACKFILL_START_ID=12345
 *   BACKFILL_BATCH_SIZE=1000
 *   BACKFILL_CONCURRENCY=25
 */

import { db } from '../lib/db'
import { analyzeEngagementType, countExclamations, countSentences, hasEmotes, messageLength } from '../lib/analytics-classifier'

const BATCH_SIZE = Math.max(1, parseInt(process.env.BACKFILL_BATCH_SIZE || '1000', 10) || 1000)
const CONCURRENCY = Math.max(1, parseInt(process.env.BACKFILL_CONCURRENCY || '25', 10) || 25)

function pLimit(concurrency: number) {
    let activeCount = 0
    const queue: Array<() => void> = []

    const next = () => {
        activeCount--
        if (queue.length > 0) queue.shift()!()
    }

    const run = async <T>(fn: () => Promise<T>): Promise<T> => {
        activeCount++
        try {
            return await fn()
        } finally {
            next()
        }
    }

    return <T>(fn: () => Promise<T>): Promise<T> =>
        new Promise<T>((resolve, reject) => {
            const task = () => run(fn).then(resolve, reject)
            if (activeCount < concurrency) task()
            else queue.push(task)
        })
}

async function backfillChatMessages(startId: bigint) {
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
            batch.map(row =>
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

        lastId = batch[batch.length - 1]!.id
        processed += batch.length
        if (processed % (BATCH_SIZE * 5) === 0) {
            console.log(`[backfill-chat-analytics] chat_messages processed=${processed}, lastId=${lastId.toString()}`)
        }
    }

    console.log(`[backfill-chat-analytics] chat_messages done. processed=${processed}, lastId=${lastId.toString()}`)
}

async function backfillOfflineChatMessages(startId: bigint) {
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
            batch.map(row =>
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

        lastId = batch[batch.length - 1]!.id
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





