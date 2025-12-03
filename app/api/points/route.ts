import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getUserPoints } from '@/lib/points'

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const kickUserId = searchParams.get('kick_user_id')

        if (!kickUserId) {
            return NextResponse.json(
                { error: 'kick_user_id is required' },
                { status: 400 }
            )
        }

        const points = await getUserPoints(BigInt(kickUserId))

        // Get subscriber status from user points
        const user = await db.user.findUnique({
            where: { kick_user_id: BigInt(kickUserId) },
            select: { id: true },
        })

        let isSubscriber = false
        if (user) {
            const userPoints = await db.userPoints.findUnique({
                where: { user_id: user.id },
                select: { is_subscriber: true },
            })
            isSubscriber = userPoints?.is_subscriber || false
        }

        return NextResponse.json({
            kick_user_id: kickUserId,
            total_points: points,
            is_subscriber: isSubscriber,
        })
    } catch (error) {
        console.error('Error fetching user points:', error)
        return NextResponse.json(
            { error: 'Failed to fetch user points', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
