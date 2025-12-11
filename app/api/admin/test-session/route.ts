import { db } from '@/lib/db'
import { isAdmin } from '@/lib/auth'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/test-session
 * Get current test session status
 */
export async function GET(request: Request) {
    try {
        const isAdminUser = await isAdmin(request)
        if (!isAdminUser) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Get the broadcaster user (sweetflips)
        const broadcaster = await db.user.findFirst({
            where: {
                username: { equals: 'sweetflips', mode: 'insensitive' },
            },
            select: { kick_user_id: true },
        })

        if (!broadcaster) {
            return NextResponse.json({
                hasActiveSession: false,
                message: 'Broadcaster not found',
            })
        }

        // Check for active session
        const activeSession = await db.streamSession.findFirst({
            where: {
                broadcaster_user_id: broadcaster.kick_user_id,
                ended_at: null,
            },
            orderBy: { started_at: 'desc' },
            select: {
                id: true,
                started_at: true,
                session_title: true,
            },
        })

        return NextResponse.json({
            hasActiveSession: !!activeSession,
            session: activeSession ? {
                id: activeSession.id.toString(),
                started_at: activeSession.started_at.toISOString(),
                title: activeSession.session_title,
            } : null,
        })
    } catch (error) {
        console.error('Error checking test session:', error)
        return NextResponse.json(
            { error: 'Failed to check session status' },
            { status: 500 }
        )
    }
}

/**
 * POST /api/admin/test-session
 * Create a new test stream session (for testing points)
 */
export async function POST(request: Request) {
    try {
        const isAdminUser = await isAdmin(request)
        if (!isAdminUser) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Get the broadcaster user (sweetflips)
        const broadcaster = await db.user.findFirst({
            where: {
                username: { equals: 'sweetflips', mode: 'insensitive' },
            },
            select: { kick_user_id: true, username: true },
        })

        if (!broadcaster) {
            return NextResponse.json(
                { error: 'Broadcaster "sweetflips" not found in database' },
                { status: 404 }
            )
        }

        // Check if there's already an active session
        const existingSession = await db.streamSession.findFirst({
            where: {
                broadcaster_user_id: broadcaster.kick_user_id,
                ended_at: null,
            },
            orderBy: { started_at: 'desc' },
        })

        if (existingSession) {
            return NextResponse.json({
                success: false,
                error: 'An active session already exists',
                session: {
                    id: existingSession.id.toString(),
                    started_at: existingSession.started_at.toISOString(),
                },
            })
        }

        // Create a new test session
        const newSession = await db.streamSession.create({
            data: {
                broadcaster_user_id: broadcaster.kick_user_id,
                channel_slug: broadcaster.username.toLowerCase(),
                session_title: '[TEST] Manual Test Session',
                thumbnail_url: null,
                kick_stream_id: null,
                started_at: new Date(),
                peak_viewer_count: 0,
            },
        })

        console.log(`[admin] Created test session ${newSession.id} for testing`)

        return NextResponse.json({
            success: true,
            message: 'Test session created - points will now be counted',
            session: {
                id: newSession.id.toString(),
                started_at: newSession.started_at.toISOString(),
                title: newSession.session_title,
            },
        })
    } catch (error) {
        console.error('Error creating test session:', error)
        return NextResponse.json(
            { error: 'Failed to create test session' },
            { status: 500 }
        )
    }
}

/**
 * DELETE /api/admin/test-session
 * End the current active session (stop testing)
 */
export async function DELETE(request: Request) {
    try {
        const isAdminUser = await isAdmin(request)
        if (!isAdminUser) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Get the broadcaster user (sweetflips)
        const broadcaster = await db.user.findFirst({
            where: {
                username: { equals: 'sweetflips', mode: 'insensitive' },
            },
            select: { kick_user_id: true },
        })

        if (!broadcaster) {
            return NextResponse.json(
                { error: 'Broadcaster not found' },
                { status: 404 }
            )
        }

        // Find active session
        const activeSession = await db.streamSession.findFirst({
            where: {
                broadcaster_user_id: broadcaster.kick_user_id,
                ended_at: null,
            },
            orderBy: { started_at: 'desc' },
        })

        if (!activeSession) {
            return NextResponse.json({
                success: false,
                error: 'No active session found',
            })
        }

        // End the session
        const endedSession = await db.streamSession.update({
            where: { id: activeSession.id },
            data: {
                ended_at: new Date(),
                updated_at: new Date(),
            },
        })

        console.log(`[admin] Ended test session ${endedSession.id}`)

        return NextResponse.json({
            success: true,
            message: 'Session ended - points will no longer be counted',
            session: {
                id: endedSession.id.toString(),
                ended_at: endedSession.ended_at?.toISOString(),
            },
        })
    } catch (error) {
        console.error('Error ending test session:', error)
        return NextResponse.json(
            { error: 'Failed to end session' },
            { status: 500 }
        )
    }
}
