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

        return NextResponse.json({
            kick_user_id: kickUserId,
            total_points: points,
        })
    } catch (error) {
        console.error('Error fetching user points:', error)
        return NextResponse.json(
            { error: 'Failed to fetch user points', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
