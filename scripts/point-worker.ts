#!/usr/bin/env node

console.log('')
console.log('========================================')
console.log('🔄 POINT WORKER STARTING')
console.log('========================================')
console.log('')

import { claimJobs, processJob, getQueueStats } from '../lib/point-queue'
import { db } from '../lib/db'

const BATCH_SIZE = parseInt(process.env.POINT_WORKER_BATCH_SIZE || '50', 10)
const POLL_INTERVAL_MS = parseInt(process.env.POINT_WORKER_POLL_INTERVAL_MS || '500', 10)
const CONCURRENCY = parseInt(process.env.POINT_WORKER_CONCURRENCY || '10', 10)
const STATS_INTERVAL_MS = parseInt(process.env.POINT_WORKER_STATS_INTERVAL_MS || '60000', 10) // 1 minute

// Advisory lock ID to ensure only one worker instance runs
const ADVISORY_LOCK_ID = BigInt('9223372036854775806')

let isShuttingDown = false
let activeWorkers = 0
let advisoryLockAcquired = false

// Acquire PostgreSQL advisory lock to ensure only one worker instance runs
async function acquireAdvisoryLock(): Promise<boolean> {
    try {
        const result = await db.$queryRaw<Array<{ pg_try_advisory_lock: boolean }>>`
            SELECT pg_try_advisory_lock(${ADVISORY_LOCK_ID}) as pg_try_advisory_lock
        `
        const acquired = result[0]?.pg_try_advisory_lock ?? false
        if (acquired) {
            advisoryLockAcquired = true
            console.log(`[point-worker] ✅ Advisory lock acquired (ID: ${ADVISORY_LOCK_ID})`)
        } else {
            console.error(`[point-worker] ❌ Failed to acquire advisory lock - another worker instance is already running`)
        }
        return acquired
    } catch (error) {
        console.error(`[point-worker] ❌ Error acquiring advisory lock:`, error)
        return false
    }
}

// Release advisory lock on shutdown
async function releaseAdvisoryLock(): Promise<void> {
    if (!advisoryLockAcquired) {
        return
    }
    try {
        await db.$queryRaw`
            SELECT pg_advisory_unlock(${ADVISORY_LOCK_ID})
        `
        console.log(`[point-worker] ✅ Advisory lock released`)
    } catch (error) {
        console.error(`[point-worker] ⚠️ Error releasing advisory lock:`, error)
    }
}

// Graceful shutdown handler
const shutdown = async (signal: string) => {
    if (isShuttingDown) {
        console.log(`[point-worker] ${signal} received again, forcing exit`)
        await releaseAdvisoryLock()
        process.exit(1)
    }

    console.log(`[point-worker] ${signal} received, shutting down gracefully...`)
    isShuttingDown = true

    // Wait for active workers to finish (max 30 seconds)
    const maxWaitTime = 30000
    const startWait = Date.now()

    while (activeWorkers > 0 && Date.now() - startWait < maxWaitTime) {
        console.log(`[point-worker] Waiting for ${activeWorkers} active workers to finish...`)
        await new Promise(resolve => setTimeout(resolve, 1000))
    }

    if (activeWorkers > 0) {
        console.log(`[point-worker] Timeout waiting for workers, forcing exit`)
        await releaseAdvisoryLock()
        process.exit(1)
    }

    await releaseAdvisoryLock()
    console.log(`[point-worker] Shutdown complete`)
    process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

// Process a batch of jobs with concurrency control
async function processBatch(): Promise<void> {
    if (isShuttingDown) {
        return
    }

    // Don't start new batches if we're at concurrency limit
    if (activeWorkers >= CONCURRENCY) {
        return
    }

    const availableSlots = CONCURRENCY - activeWorkers
    const batchSize = Math.min(BATCH_SIZE, availableSlots)

    const jobs = await claimJobs(batchSize)

    if (jobs.length === 0) {
        return
    }

    // Process jobs concurrently (up to concurrency limit)
    const processingPromises = jobs.map(async (job) => {
        activeWorkers++
        try {
            await processJob(job)
        } catch (error) {
            console.error(`[point-worker] Unexpected error processing job id=${job.id}:`, error)
        } finally {
            activeWorkers--
        }
    })

    await Promise.all(processingPromises)
}

// Main worker loop
async function runWorker(): Promise<void> {
    console.log(`[point-worker] Starting point award worker`)
    console.log(`[point-worker] Configuration: batchSize=${BATCH_SIZE}, pollInterval=${POLL_INTERVAL_MS}ms, concurrency=${CONCURRENCY}`)

    // Acquire advisory lock - exit if another worker is already running
    const lockAcquired = await acquireAdvisoryLock()
    if (!lockAcquired) {
        console.error(`[point-worker] Exiting - another worker instance is already running`)
        process.exit(1)
    }

    let lastStatsLog = Date.now()

    while (!isShuttingDown) {
        try {
            await processBatch()

            // Log stats periodically
            const now = Date.now()
            if (now - lastStatsLog >= STATS_INTERVAL_MS) {
                const stats = await getQueueStats()
                console.log(`[point-worker] Queue stats: pending=${stats.pending}, processing=${stats.processing}, completed=${stats.completed}, failed=${stats.failed}, staleLocks=${stats.staleLocks}`)
                lastStatsLog = now
            }

            // Wait before next poll
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
        } catch (error) {
            console.error(`[point-worker] Error in worker loop:`, error)
            // Wait a bit longer on error before retrying
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS * 2))
        }
    }
}

// Start the worker
runWorker().catch(async (error) => {
    console.error(`[point-worker] Fatal error:`, error)
    await releaseAdvisoryLock()
    process.exit(1)
})
