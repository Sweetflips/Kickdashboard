#!/usr/bin/env node

/**
 * Session Tracker Worker
 *
 * Prevents stream session drift by continuously tracking live/offline status,
 * independent of frontend traffic.
 *
 * Why:
 * - `/api/channel` currently drives session start/end when the website polls it.
 * - If nobody is visiting (or polling pauses), `ended_at` can be stamped late.
 *
 * This worker:
 * - Polls Kick for each configured channel slug on an interval
 * - Creates/touches sessions while live
 * - Ends sessions when offline (with the existing grace period)
 *
 * Notes:
 * - Uses a PostgreSQL advisory lock so only one instance runs.
 */

import { db } from '../lib/db'
import { getChannelWithLivestream } from '../lib/kick-api'
import {
    endActiveSession,
    getActiveSession,
    getOrCreateActiveSession,
    touchSession,
    updateSessionMetadata,
} from '../lib/stream-session-manager'

const POLL_INTERVAL_MS = parseInt(process.env.SESSION_TRACKER_POLL_INTERVAL_MS || '15000', 10)
const SLUGS_RAW = process.env.SESSION_TRACKER_SLUGS || process.env.KICK_CHANNEL_SLUG || 'sweetflips'
const SLUGS = SLUGS_RAW
    .split(',')
    .map((s: any) => s.trim().toLowerCase())
    .filter(Boolean)

// Advisory lock ID to ensure only one session tracker runs
// (Must be unique across workers; chat-worker/point-worker already use other IDs)
const ADVISORY_LOCK_ID = BigInt('9223372036854775804')

let isShuttingDown = false
let advisoryLockAcquired = false

const lastKnownLive = new Map<string, boolean>()

async function acquireAdvisoryLock(): Promise<boolean> {
    try {
        const result = await (db as any).$queryRaw<Array<{ pg_try_advisory_lock: boolean }>>`
            SELECT pg_try_advisory_lock(${ADVISORY_LOCK_ID}) as pg_try_advisory_lock
        `
        const acquired = result[0]?.pg_try_advisory_lock ?? false
        if (acquired) {
            advisoryLockAcquired = true
            console.log(`[session-tracker] ✅ Advisory lock acquired (ID: ${ADVISORY_LOCK_ID})`)
        } else {
            console.error(`[session-tracker] ❌ Failed to acquire advisory lock - another instance is already running`)
        }
        return acquired
    } catch (error) {
        console.error(`[session-tracker] ❌ Error acquiring advisory lock:`, error)
        return false
    }
}

async function releaseAdvisoryLock(): Promise<void> {
    if (!advisoryLockAcquired) return
    try {
        await (db as any).$queryRaw`SELECT pg_advisory_unlock(${ADVISORY_LOCK_ID})`
        console.log(`[session-tracker] ✅ Advisory lock released`)
    } catch (error) {
        console.error(`[session-tracker] ⚠️ Error releasing advisory lock:`, error)
    }
}

const shutdown = async (signal: string) => {
    if (isShuttingDown) {
        console.log(`[session-tracker] ${signal} received again, forcing exit`)
        await releaseAdvisoryLock()
        process.exit(1)
    }
    console.log(`[session-tracker] ${signal} received, shutting down...`)
    isShuttingDown = true
    await releaseAdvisoryLock()
    process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

async function resolveBroadcasterId(slug: string): Promise<bigint | null> {
    const user = await (db as any).user.findFirst({
        where: {
            username: { equals: slug, mode: 'insensitive' },
        },
        select: {
            kick_user_id: true,
        },
    })
    if (!user?.kick_user_id) return null
    try {
        return BigInt(user.kick_user_id)
    } catch {
        return null
    }
}

async function pollOne(slug: string): Promise<void> {
    const broadcasterId = await resolveBroadcasterId(slug)
    if (!broadcasterId) {
        console.warn(`[session-tracker] ⚠️ No broadcaster found in DB for slug=${slug}`)
        return
    }

    // getChannelWithLivestream() returns null when offline
    const live = await getChannelWithLivestream(slug)
    const isLive = !!live

    const prev = lastKnownLive.get(slug)
    if (prev === undefined || prev !== isLive) {
        console.log(`[session-tracker] ${slug}: ${isLive ? 'LIVE' : 'OFFLINE'}`)
        lastKnownLive.set(slug, isLive)
    }

    if (isLive) {
        const startedAt = live?.startedAt ?? null
        const thumbnailUrl = live?.thumbnailUrl ?? null

        // Ensure we have an active session (created if needed, touched if already exists)
        const session = await getOrCreateActiveSession(
            broadcasterId,
            slug,
            {
                thumbnailUrl,
                // Don't set kickStreamId here: our schema uses this for VOD ids.
                // Live sessions get VOD ids later via sync.
                kickStreamId: null,
                sessionTitle: null,
                startedAt,
            },
            startedAt
        )

        if (!session) return

        // Keep last_live_check_at fresh (grace period uses this)
        await touchSession(session.id)

        // Best-effort: keep thumbnail fresh during live
        if (thumbnailUrl) {
            await updateSessionMetadata(session.id, { thumbnailUrl })
        }
    } else {
        // Offline: end session (grace period applies inside stream-session-manager)
        await endActiveSession(broadcasterId, false)

        // If we still see an active session after trying to end, log it (helps debug stuck-live cases)
        const stillActive = await getActiveSession(broadcasterId)
        if (stillActive) {
            console.log(`[session-tracker] ${slug}: still active (within grace period or test session) sessionId=${stillActive.id.toString()}`)
        }
    }
}

async function main(): Promise<void> {
    console.log('')
    console.log('========================================')
    console.log('📡 SESSION TRACKER STARTING')
    console.log('========================================')
    console.log('')
    console.log(`[session-tracker] slugs=${SLUGS.join(', ')} intervalMs=${POLL_INTERVAL_MS}`)

    const lockAcquired = await acquireAdvisoryLock()
    if (!lockAcquired) {
        process.exit(1)
    }

    while (!isShuttingDown) {
        const started = Date.now()
        try {
            // Poll sequentially to avoid unnecessary concurrent pressure on Kick API
            for (const slug of SLUGS) {
                if (isShuttingDown) break
                await pollOne(slug)
            }
        } catch (error) {
            console.error('[session-tracker] Error in poll loop:', error)
        } finally {
            const elapsed = Date.now() - started
            const sleepMs = Math.max(250, POLL_INTERVAL_MS - elapsed)
            await new Promise(resolve => setTimeout(resolve, sleepMs))
        }
    }
}

main().catch(async (error) => {
    console.error('[session-tracker] Fatal error:', error)
    await releaseAdvisoryLock()
    process.exit(1)
})
