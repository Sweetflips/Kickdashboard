#!/usr/bin/env node
import { claimJobs, processJob, getQueueStats } from '../lib/point-queue'

const BATCH_SIZE = parseInt(process.env.POINT_WORKER_BATCH_SIZE || '10', 10)
const POLL_INTERVAL_MS = parseInt(process.env.POINT_WORKER_POLL_INTERVAL_MS || '1000', 10)
const CONCURRENCY = parseInt(process.env.POINT_WORKER_CONCURRENCY || '5', 10)
const STATS_INTERVAL_MS = parseInt(process.env.POINT_WORKER_STATS_INTERVAL_MS || '60000', 10) // 1 minute

let isShuttingDown = false
let activeWorkers = 0

// Graceful shutdown handler
const shutdown = async (signal: string) => {
    if (isShuttingDown) {
        console.log(`[point-worker] ${signal} received again, forcing exit`)
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
        process.exit(1)
    }

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
runWorker().catch((error) => {
    console.error(`[point-worker] Fatal error:`, error)
    process.exit(1)
})


