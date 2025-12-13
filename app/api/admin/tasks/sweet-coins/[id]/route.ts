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

    const job = await db.sweetCoinAwardJob.findUnique({
      where: { id: BigInt(id) },
    })

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    const user = await db.user.findUnique({
      where: { kick_user_id: job.kick_user_id },
      select: { username: true, kick_user_id: true },
    })

    return NextResponse.json({
      success: true,
      job: {
        type: 'sweet_coins' as const,
        id: job.id.toString(),
        status: job.status,
        attempts: job.attempts,
        message_id: job.message_id,
        kick_user_id: job.kick_user_id.toString(),
        username: user?.username || null,
        stream_session_id: job.stream_session_id?.toString() || null,
        badges: job.badges ?? null,
        emotes: job.emotes ?? null,
        locked_at: job.locked_at?.toISOString() || null,
        processed_at: job.processed_at?.toISOString() || null,
        created_at: job.created_at.toISOString(),
        updated_at: job.updated_at.toISOString(),
        last_error: job.last_error || null,
      },
    })
  } catch (error) {
    console.error('Error fetching sweet coin job detail:', error)
    return NextResponse.json(
      { error: 'Failed to fetch sweet coin job', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
