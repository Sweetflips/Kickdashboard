import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

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

        // Parse kick_user_id as BigInt
        let kickUserIdBigInt: bigint
        try {
            kickUserIdBigInt = BigInt(kickUserId)
        } catch (e) {
            return NextResponse.json(
                { error: 'Invalid kick_user_id format' },
                { status: 400 }
            )
        }

        // Get user with points relation in a single query
        const user = await db.user.findUnique({
            where: { kick_user_id: kickUserIdBigInt },
            include: {
                points: {
                    select: {
                        total_points: true,
                        is_subscriber: true,
                    },
                },
            },
        })

        if (!user) {
            // User not found - return 0 points (they may not have chatted yet)
            return NextResponse.json({
                kick_user_id: kickUserId,
                total_points: 0,
                is_subscriber: false,
            })
        }

        return NextResponse.json({
            kick_user_id: kickUserId,
            total_points: user.points?.total_points || 0,
            is_subscriber: user.points?.is_subscriber || false,
        })
    } catch (error) {
        console.error('Error fetching user points:', error)
        return NextResponse.json(
            { error: 'Failed to fetch user points', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
