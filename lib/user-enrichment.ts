/**
 * User Enrichment Queue
 *
 * Batches user enrichment API calls to avoid rate limiting the Kick API.
 * Instead of calling getUsersByIds for every chat message, we queue users
 * and process them in batches.
 */

import { db } from '@/lib/db'

interface EnrichmentRequest {
    kickUserId: bigint
    username: string
}

const enrichmentQueue = {
    // Queue of users to enrich
    pending: new Map<string, EnrichmentRequest>(), // key = kickUserId as string
    // Timer for batch processing
    timer: null as NodeJS.Timeout | null,
    // Batch delay - wait this long to accumulate requests before processing
    batchDelay: 5000, // 5 seconds
    // Max queue size before forcing a batch
    maxQueueSize: 20,
    // Processing lock
    isProcessing: false,
    // Cooldown between batches
    lastBatchTime: 0,
    minBatchInterval: 10000, // 10 seconds between batches
}

/**
 * Queue a user for enrichment - batched to avoid rate limits
 */
export function queueUserEnrichment(kickUserId: bigint, username: string): void {
    const key = kickUserId.toString()

    // Skip if already queued
    if (enrichmentQueue.pending.has(key)) {
        return
    }

    enrichmentQueue.pending.set(key, { kickUserId, username })

    // If queue is getting large, process immediately
    if (enrichmentQueue.pending.size >= enrichmentQueue.maxQueueSize) {
        processEnrichmentQueue()
        return
    }

    // Otherwise, schedule batch processing
    if (!enrichmentQueue.timer) {
        enrichmentQueue.timer = setTimeout(() => {
            enrichmentQueue.timer = null
            processEnrichmentQueue()
        }, enrichmentQueue.batchDelay)
    }
}

/**
 * Process the enrichment queue in a batch
 */
async function processEnrichmentQueue(): Promise<void> {
    // Don't run if already processing or queue is empty
    if (enrichmentQueue.isProcessing || enrichmentQueue.pending.size === 0) {
        return
    }

    // Respect cooldown between batches
    const now = Date.now()
    const timeSinceLastBatch = now - enrichmentQueue.lastBatchTime
    if (timeSinceLastBatch < enrichmentQueue.minBatchInterval) {
        // Reschedule for later
        if (!enrichmentQueue.timer) {
            enrichmentQueue.timer = setTimeout(() => {
                enrichmentQueue.timer = null
                processEnrichmentQueue()
            }, enrichmentQueue.minBatchInterval - timeSinceLastBatch)
        }
        return
    }

    enrichmentQueue.isProcessing = true
    enrichmentQueue.lastBatchTime = now

    // Take current queue and clear it
    const toProcess = Array.from(enrichmentQueue.pending.values())
    enrichmentQueue.pending.clear()

    // Clear any pending timer
    if (enrichmentQueue.timer) {
        clearTimeout(enrichmentQueue.timer)
        enrichmentQueue.timer = null
    }

    console.log(`[User Enrichment] Processing batch of ${toProcess.length} users`)

    try {
        const { getUsersByIds, getUserInfoBySlug } = await import('@/lib/kick-api')

        // Batch fetch from Users API
        const userIds = toProcess.map(r => Number(r.kickUserId))
        const usersData = await getUsersByIds(userIds)

        // Helper for DB updates with retry logic for connection pool exhaustion
        const updateWithRetry = async (kickUserId: bigint, data: object, maxRetries = 3) => {
            for (let attempt = 0; attempt < maxRetries; attempt++) {
                try {
                    await (db as any).user.update({
                        where: { kick_user_id: kickUserId },
                        data,
                    })
                    return true
                } catch (error: any) {
                    if ((error?.code === 'P2024' || error?.message?.includes('connection pool')) && attempt < maxRetries - 1) {
                        await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt)))
                        continue
                    }
                    throw error
                }
            }
            return false
        }

        // Process results
        let enrichedCount = 0
        for (const request of toProcess) {
            const userData = usersData.get(Number(request.kickUserId))

            try {
                if (userData) {
                    // Update with full user data from Users API
                    const success = await updateWithRetry(request.kickUserId, {
                        username: userData.name,
                        email: userData.email || undefined,
                        profile_picture_url: userData.profile_picture || undefined,
                    })
                    if (success) enrichedCount++
                } else if (request.username && request.username !== 'Unknown') {
                    // Fallback to channel API for profile picture/bio
                    const channelInfo = await getUserInfoBySlug(request.username.toLowerCase())
                    if (channelInfo) {
                        const success = await updateWithRetry(request.kickUserId, {
                            ...(channelInfo.profile_picture_url && {
                                profile_picture_url: channelInfo.profile_picture_url
                            }),
                            ...(channelInfo.bio && { bio: channelInfo.bio }),
                        })
                        if (success) enrichedCount++
                    }
                }
            } catch (error) {
                // Silently fail individual updates - non-critical
                console.debug(`Failed to enrich user ${request.kickUserId}:`, error)
            }
        }

        console.log(`[User Enrichment] Completed batch, enriched ${enrichedCount}/${toProcess.length} users`)
    } catch (error) {
        console.error(`[User Enrichment] Batch processing failed:`, error)
    } finally {
        enrichmentQueue.isProcessing = false
    }
}

/**
 * Get queue stats for debugging
 */
export function getEnrichmentQueueStats(): {
    pendingCount: number
    isProcessing: boolean
    lastBatchTime: number
} {
    return {
        pendingCount: enrichmentQueue.pending.size,
        isProcessing: enrichmentQueue.isProcessing,
        lastBatchTime: enrichmentQueue.lastBatchTime,
    }
}
