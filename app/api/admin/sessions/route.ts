import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { getActiveSession } from '@/lib/stream-session-manager'

export const dynamic = 'force-dynamic'

/**
 * GET - List recent sessions and check for active session
 * POST - Reopen a recently ended session (continue stream)
 */

export async function GET(request: Request) {
    try {
        const adminCheck = await isAdmin(request)
        if (!adminCheck) {
            return NextResponse.json(
                { error: 'Unauthorized - Admin access required' },
                { status: 403 }
            )
        }

        const { searchParams } = new URL(request.url)
        const broadcasterUserIdParam = searchParams.get('broadcaster_user_id')

        // Default to sweetflips if no broadcaster specified
        let broadcasterUserId: bigint | null = null

        if (broadcasterUserIdParam) {
            broadcasterUserId = BigInt(broadcasterUserIdParam)
        } else {
            // Find the main broadcaster
            const broadcaster = await db.user.findFirst({
                where: { is_broadcaster: true },
                select: { kick_user_id: true },
            })
            if (broadcaster) {
                broadcasterUserId = broadcaster.kick_user_id
            }
        }

        if (!broadcasterUserId) {
            return NextResponse.json({ error: 'No broadcaster found' }, { status: 404 })
        }

        // Get active session
        const activeSession = await getActiveSession(broadcasterUserId)

        // Get recent sessions (last 10)
        const recentSessions = await db.streamSession.findMany({
            where: { broadcaster_user_id: broadcasterUserId },
            orderBy: { started_at: 'desc' },
            take: 10,
            select: {
                id: true,
                session_title: true,
                started_at: true,
                ended_at: true,
                duration_seconds: true,
                total_messages: true,
                peak_viewer_count: true,
                kick_stream_id: true,
                last_live_check_at: true,
            },
        })

        return NextResponse.json({
            broadcaster_user_id: broadcasterUserId.toString(),
            active_session: activeSession ? {
                id: activeSession.id.toString(),
                session_title: activeSession.session_title,
                started_at: activeSession.started_at.toISOString(),
                last_live_check_at: activeSession.last_live_check_at?.toISOString() || null,
                total_messages: activeSession.total_messages,
                peak_viewer_count: activeSession.peak_viewer_count,
            } : null,
            recent_sessions: recentSessions.map(s => ({
                id: s.id.toString(),
                session_title: s.session_title,
                started_at: s.started_at.toISOString(),
                ended_at: s.ended_at?.toISOString() || null,
                duration_seconds: s.duration_seconds,
                total_messages: s.total_messages,
                peak_viewer_count: s.peak_viewer_count,
                kick_stream_id: s.kick_stream_id,
                last_live_check_at: s.last_live_check_at?.toISOString() || null,
                is_active: s.ended_at === null,
            })),
        })
    } catch (error) {
        console.error('[Admin Sessions] Error:', error)
        return NextResponse.json(
            { error: 'Failed to fetch sessions', details: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        )
    }
}

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
        const action = body.action as string

        if (action === 'reopen') {
            // Reopen a recently ended session (set ended_at to null)
            const sessionIdRaw = body.session_id
            if (!sessionIdRaw) {
                return NextResponse.json({ error: 'session_id is required' }, { status: 400 })
            }

            const sessionId = BigInt(String(sessionIdRaw))

            // Check if this session exists and was recently ended
            const session = await db.streamSession.findUnique({
                where: { id: sessionId },
                select: {
                    id: true,
                    ended_at: true,
                    broadcaster_user_id: true,
                },
            })

            if (!session) {
                return NextResponse.json({ error: 'Session not found' }, { status: 404 })
            }

            if (!session.ended_at) {
                return NextResponse.json({ error: 'Session is already active' }, { status: 400 })
            }

            // Check if there's already an active session for this broadcaster
            const existingActive = await getActiveSession(session.broadcaster_user_id)
            if (existingActive) {
                return NextResponse.json({
                    error: 'Another session is already active',
                    active_session_id: existingActive.id.toString(),
                }, { status: 409 })
            }

            // Reopen the session
            await db.streamSession.update({
                where: { id: sessionId },
                data: {
                    ended_at: null,
                    duration_seconds: null,
                    last_live_check_at: new Date(),
                    updated_at: new Date(),
                },
            })

            console.log(`[Admin Sessions] Reopened session ${sessionId}`)

            return NextResponse.json({
                success: true,
                message: `Session ${sessionId} has been reopened`,
                session_id: sessionId.toString(),
            })
        }

        if (action === 'delete_and_merge') {
            // Delete a newer session and merge its data into an older one
            const sourceSessionId = BigInt(String(body.source_session_id))
            const targetSessionId = BigInt(String(body.target_session_id))

            // Move all chat messages and history from source to target
            await db.$transaction(async (tx) => {
                await tx.chatMessage.updateMany({
                    where: { stream_session_id: sourceSessionId },
                    data: { stream_session_id: targetSessionId },
                })

                await tx.sweetCoinHistory.updateMany({
                    where: { stream_session_id: sourceSessionId },
                    data: { stream_session_id: targetSessionId },
                })

                await tx.sweetCoinAwardJob.updateMany({
                    where: { stream_session_id: sourceSessionId },
                    data: { stream_session_id: targetSessionId },
                })

                await tx.chatJob.updateMany({
                    where: { stream_session_id: sourceSessionId },
                    data: { stream_session_id: targetSessionId },
                })

                // Delete the source session
                await tx.streamSession.delete({
                    where: { id: sourceSessionId },
                })

                // Reopen target session if it was ended
                await tx.streamSession.update({
                    where: { id: targetSessionId },
                    data: {
                        ended_at: null,
                        duration_seconds: null,
                        last_live_check_at: new Date(),
                        updated_at: new Date(),
                    },
                })
            })

            console.log(`[Admin Sessions] Merged session ${sourceSessionId} into ${targetSessionId} and reopened`)

            return NextResponse.json({
                success: true,
                message: `Session ${sourceSessionId} merged into ${targetSessionId} and reopened`,
            })
        }

        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    } catch (error) {
        console.error('[Admin Sessions] Error:', error)
        return NextResponse.json(
            { error: 'Failed to manage session', details: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        )
    }
}
