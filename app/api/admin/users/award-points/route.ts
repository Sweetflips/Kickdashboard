import { isAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/users/award-points
 * Manually award points to a user
 */
export async function POST(request: Request) {
    try {
        const adminCheck = await isAdmin(request)
        if (!adminCheck) {
            return NextResponse.json(
                { error: 'Unauthorized - Admin access required' },
                { status: 403 }
            )
        }

        const body = await request.json()
        const { kick_user_id, points, reason } = body

        if (!kick_user_id || !points) {
            return NextResponse.json(
                { error: 'kick_user_id and points are required' },
                { status: 400 }
            )
        }

        const pointsValue = parseInt(points)
        if (isNaN(pointsValue) || pointsValue === 0) {
            return NextResponse.json(
                { error: 'Points must be a non-zero number' },
                { status: 400 }
            )
        }

        if (Math.abs(pointsValue) > 1000000) {
            return NextResponse.json(
                { error: 'Points value too large (max ±1,000,000)' },
                { status: 400 }
            )
        }

        // Find user
        const user = await db.user.findUnique({
            where: { kick_user_id: BigInt(kick_user_id) },
            select: { id: true, username: true },
        })

        if (!user) {
            return NextResponse.json(
                { error: 'User not found' },
                { status: 404 }
            )
        }

        // Use transaction to ensure atomicity
        const result = await db.$transaction(async (tx) => {
            // Update or create user points
            const userPoints = await tx.userPoints.upsert({
                where: { user_id: user.id },
                update: {
                    total_points: {
                        increment: pointsValue,
                    },
                },
                create: {
                    user_id: user.id,
                    total_points: Math.max(0, pointsValue), // Ensure non-negative
                    total_emotes: 0,
                },
            })

            // Create point history entry
            await tx.pointHistory.create({
                data: {
                    user_id: user.id,
                    points_earned: pointsValue,
                    message_id: `admin-award-${Date.now()}`,
                    stream_session_id: null,
                    earned_at: new Date(),
                },
            })

            return {
                username: user.username,
                new_total: userPoints.total_points,
                points_awarded: pointsValue,
            }
        })

        return NextResponse.json({
            success: true,
            ...result,
            message: `Successfully ${pointsValue > 0 ? 'awarded' : 'deducted'} ${Math.abs(pointsValue).toLocaleString()} points ${pointsValue > 0 ? 'to' : 'from'} ${result.username}`,
            reason: reason || null,
        })
    } catch (error) {
        console.error('Error awarding points:', error)
        return NextResponse.json(
            {
                error: 'Failed to award points',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        )
    }
}
