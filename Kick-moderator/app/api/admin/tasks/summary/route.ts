import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/auth'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const adminCheck = await isAdmin(request)
    if (!adminCheck) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 })
    }

    const [sweetCoins, chat, sweetStale, chatStale] = await Promise.all([
      Promise.all([
        db.sweetCoinAwardJob.count({ where: { status: 'pending' } }),
        db.sweetCoinAwardJob.count({ where: { status: 'processing' } }),
        db.sweetCoinAwardJob.count({ where: { status: 'completed' } }),
        db.sweetCoinAwardJob.count({ where: { status: 'failed' } }),
      ]),
      Promise.all([
        db.chatJob.count({ where: { status: 'pending' } }),
        db.chatJob.count({ where: { status: 'processing' } }),
        db.chatJob.count({ where: { status: 'completed' } }),
        db.chatJob.count({ where: { status: 'failed' } }),
      ]),
      db.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint as count
        FROM sweet_coin_award_jobs
        WHERE status = 'processing'
        AND locked_at < NOW() - INTERVAL '5 minutes'
      `,
      db.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint as count
        FROM chat_jobs
        WHERE status = 'processing'
        AND locked_at < NOW() - INTERVAL '5 minutes'
      `,
    ])

    return NextResponse.json({
      success: true,
      queues: {
        sweet_coins: {
          pending: sweetCoins[0],
          processing: sweetCoins[1],
          completed: sweetCoins[2],
          failed: sweetCoins[3],
          staleLocks: Number(sweetStale?.[0]?.count || 0),
        },
        chat: {
          pending: chat[0],
          processing: chat[1],
          completed: chat[2],
          failed: chat[3],
          staleLocks: Number(chatStale?.[0]?.count || 0),
        },
      },
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Error fetching task manager summary:', error)
    return NextResponse.json(
      { error: 'Failed to fetch task manager summary', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
