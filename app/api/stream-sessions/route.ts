import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { isAdmin } from '@/lib/auth'

export async function GET(request: Request) {
    try {
        // Check admin access - Past Streams are admin-only
        const adminCheck = await isAdmin(request)
        if (!adminCheck) {
            return NextResponse.json(
                { error: 'Unauthorized - Admin access required' },
                { status: 403 }
            )
        }

        const { searchParams } = new URL(request.url)
        const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '50', 10) || 50))
        const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0)
        const broadcasterUserId = searchParams.get('broadcaster_user_id')

        const where: Prisma.StreamSessionWhereInput = {
            ended_at: { not: null }, // Only show ended streams for Past Streams
        }

        // Safely convert broadcasterUserId to BigInt if provided
        if (broadcasterUserId) {
            try {
                const userId = BigInt(broadcasterUserId)
                where.broadcaster_user_id = userId
            } catch (error) {
                return NextResponse.json(
                    { error: 'Invalid broadcaster_user_id format' },
                    { status: 400 }
                )
            }
        }

        const [sessions, total] = await Promise.all([
            db.streamSession.findMany({
                where,
                orderBy: { started_at: 'desc' },
                take: limit,
                skip: offset,
                include: {
                    broadcaster: {
                        select: {
                            username: true,
                            profile_picture_url: true,
                        },
                    },
                },
            }),
            db.streamSession.count({ where }),
        ])

        // Calculate duration for completed streams with null safety
        const sessionsWithDuration = sessions.map(session => {
            let duration: number | null = null
            if (session.ended_at && session.started_at) {
                try {
                    duration = Math.floor((session.ended_at.getTime() - session.started_at.getTime()) / 1000)
                    // Ensure duration is non-negative
                    if (duration < 0) duration = 0
                } catch (error) {
                    console.error('Error calculating duration for session:', session.id, error)
                    duration = null
                }
            }

            return {
                id: session.id.toString(),
                broadcaster_user_id: session.broadcaster_user_id.toString(),
                channel_slug: session.channel_slug || '',
                session_title: session.session_title || null,
                thumbnail_url: session.thumbnail_url || null,
                started_at: session.started_at?.toISOString() || new Date().toISOString(),
                ended_at: session.ended_at?.toISOString() || null,
                peak_viewer_count: session.peak_viewer_count || 0,
                total_messages: session.total_messages || 0,
                duration_seconds: duration,
                duration_formatted: duration !== null && duration >= 0 ? formatDuration(duration) : null,
                broadcaster: session.broadcaster || {
                    username: 'Unknown',
                    profile_picture_url: null,
                },
            }
        })

        return NextResponse.json({
            sessions: sessionsWithDuration,
            total,
            limit,
            offset,
        })
    } catch (error) {
        console.error('Error fetching stream sessions:', error)
        return NextResponse.json(
            { error: 'Failed to fetch stream sessions', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const {
            broadcaster_user_id,
            channel_slug,
            session_title,
            started_at,
        } = body

        if (!broadcaster_user_id || !channel_slug) {
            return NextResponse.json(
                { error: 'broadcaster_user_id and channel_slug are required' },
                { status: 400 }
            )
        }

        // Check if there's an active session for this broadcaster
        const activeSession = await db.streamSession.findFirst({
            where: {
                broadcaster_user_id: BigInt(broadcaster_user_id),
                ended_at: null,
            },
            orderBy: { started_at: 'desc' },
        })

        if (activeSession) {
            // Update existing active session
            const updated = await db.streamSession.update({
                where: { id: activeSession.id },
                data: {
                    session_title: session_title || activeSession.session_title,
                    updated_at: new Date(),
                },
            })

            return NextResponse.json({
                success: true,
                session: {
                    ...updated,
                    id: updated.id.toString(),
                    broadcaster_user_id: updated.broadcaster_user_id.toString(),
                },
                message: 'Updated existing active session',
            })
        }

        // Create new session
        const session = await db.streamSession.create({
            data: {
                broadcaster_user_id: BigInt(broadcaster_user_id),
                channel_slug,
                session_title: session_title || null,
                started_at: started_at ? new Date(started_at) : new Date(),
            },
        })

        return NextResponse.json({
            success: true,
            session: {
                ...session,
                id: session.id.toString(),
                broadcaster_user_id: session.broadcaster_user_id.toString(),
            },
            message: 'Created new stream session',
        })
    } catch (error) {
        console.error('Error creating stream session:', error)
        return NextResponse.json(
            { error: 'Failed to create stream session', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}

export async function PATCH(request: Request) {
    try {
        const body = await request.json()
        const {
            session_id,
            session_title,
            peak_viewer_count,
            total_messages,
            ended_at,
        } = body

        if (!session_id) {
            return NextResponse.json(
                { error: 'session_id is required' },
                { status: 400 }
            )
        }

        const updateData: any = {
            updated_at: new Date(),
        }

        if (session_title !== undefined) updateData.session_title = session_title
        if (peak_viewer_count !== undefined) updateData.peak_viewer_count = peak_viewer_count
        if (total_messages !== undefined) updateData.total_messages = total_messages
        if (ended_at !== undefined) updateData.ended_at = ended_at ? new Date(ended_at) : null

        const session = await db.streamSession.update({
            where: { id: BigInt(session_id) },
            data: updateData,
        })

        return NextResponse.json({
            success: true,
            session: {
                ...session,
                id: session.id.toString(),
                broadcaster_user_id: session.broadcaster_user_id.toString(),
            },
            message: 'Updated stream session',
        })
    } catch (error) {
        console.error('Error updating stream session:', error)
        return NextResponse.json(
            { error: 'Failed to update stream session', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}

function formatDuration(seconds: number): string {
    // Ensure seconds is a valid positive number
    const safeSeconds = Math.max(0, Math.floor(seconds || 0))

    const hours = Math.floor(safeSeconds / 3600)
    const minutes = Math.floor((safeSeconds % 3600) / 60)
    const secs = safeSeconds % 60

    if (hours > 0) {
        return `${hours}h ${minutes}m ${secs}s`
    } else if (minutes > 0) {
        return `${minutes}m ${secs}s`
    } else {
        return `${secs}s`
    }
}
