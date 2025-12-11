import { isAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

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

        // Fetch all sessions (or a reasonable limit) to deduplicate properly
        const allSessions = await db.streamSession.findMany({
            where,
            orderBy: { started_at: 'desc' },
            take: 1000, // Reasonable limit for deduplication
            include: {
                broadcaster: {
                    select: {
                        username: true,
                        profile_picture_url: true,
                    },
                },
            },
        })

        // Deduplicate sessions: same broadcaster, same started_at (within 1 minute), keep the one with most messages
        const deduplicatedSessions = allSessions.reduce((acc, session) => {
            const existingIndex = acc.findIndex(s =>
                s.broadcaster_user_id === session.broadcaster_user_id &&
                Math.abs(s.started_at.getTime() - session.started_at.getTime()) < 60000 // Within 1 minute
            )

            if (existingIndex === -1) {
                acc.push(session)
            } else {
                // Keep the session with more messages, or if equal, the one with lower ID (created first)
                const existing = acc[existingIndex]
                if (session.total_messages > existing.total_messages ||
                    (session.total_messages === existing.total_messages && session.id < existing.id)) {
                    acc[existingIndex] = session
                }
            }
            return acc
        }, [] as typeof allSessions)

        // Paginate after deduplication
        const total = deduplicatedSessions.length
        const paginatedSessions = deduplicatedSessions.slice(offset, offset + limit)

        // Calculate duration for completed streams with null safety
        const sessionsWithDuration = paginatedSessions.map(session => {
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
                kick_stream_id: session.kick_stream_id || null,
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

export async function DELETE(request: Request) {
    try {
        // Check admin access - Only admins can delete streams
        const adminCheck = await isAdmin(request)
        if (!adminCheck) {
            return NextResponse.json(
                { error: 'Unauthorized - Admin access required' },
                { status: 403 }
            )
        }

        const { searchParams } = new URL(request.url)
        const sessionId = searchParams.get('id')

        if (!sessionId) {
            return NextResponse.json(
                { error: 'session_id is required' },
                { status: 400 }
            )
        }

        // Convert to BigInt
        let sessionIdBigInt: bigint
        try {
            sessionIdBigInt = BigInt(sessionId)
        } catch (error) {
            return NextResponse.json(
                { error: 'Invalid session_id format' },
                { status: 400 }
            )
        }

        // Delete the session
        await db.streamSession.delete({
            where: { id: sessionIdBigInt },
        })

        return NextResponse.json({
            success: true,
            message: 'Stream session deleted successfully',
        })
    } catch (error) {
        console.error('Error deleting stream session:', error)
        return NextResponse.json(
            { error: 'Failed to delete stream session', details: error instanceof Error ? error.message : 'Unknown error' },
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
