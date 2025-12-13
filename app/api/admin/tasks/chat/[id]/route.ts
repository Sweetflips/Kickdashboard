import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/auth'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: Request, ctx: { params: { id: string } }) {
  try {
    const adminCheck = await isAdmin(request)
    if (!adminCheck) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 })
    }

    const id = ctx?.params?.id
    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    const job = await db.chatJob.findUnique({
      where: { id: BigInt(id) },
    })

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      job: {
        type: 'chat' as const,
        id: job.id.toString(),
        status: job.status,
        attempts: job.attempts,
        message_id: job.message_id,
        sender_user_id: job.sender_user_id.toString(),
        broadcaster_user_id: job.broadcaster_user_id.toString(),
        stream_session_id: job.stream_session_id?.toString() || null,
        payload: job.payload ?? null,
        locked_at: job.locked_at?.toISOString() || null,
        processed_at: job.processed_at?.toISOString() || null,
        created_at: job.created_at.toISOString(),
        updated_at: job.updated_at.toISOString(),
        last_error: job.last_error || null,
      },
    })
  } catch (error) {
    console.error('Error fetching chat job detail:', error)
    return NextResponse.json(
      { error: 'Failed to fetch chat job', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
