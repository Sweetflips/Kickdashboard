import { NextResponse } from 'next/server'
import { getQueueStats } from '@/lib/sweet-coin-queue'
import { isAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * Get queue statistics for sweet coin award jobs
 * GET /api/admin/sweet-coins/queue-stats
 * Requires admin authentication
 */
export async function GET(request: Request) {
    try {
        // Check admin access
        const adminCheck = await isAdmin(request)
        if (!adminCheck) {
            return NextResponse.json(
                { error: 'Unauthorized - Admin access required' },
                { status: 403 }
            )
        }

        const stats = await getQueueStats()

        return NextResponse.json({
            success: true,
            stats: {
                pending: stats.pending,
                processing: stats.processing,
                completed: stats.completed,
                failed: stats.failed,
                staleLocks: stats.staleLocks,
            },
            timestamp: new Date().toISOString(),
        })
    } catch (error) {
        console.error('Error fetching queue stats:', error)
        return NextResponse.json(
            {
                error: 'Failed to fetch queue stats',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        )
    }
}
