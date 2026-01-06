import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/auth'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const adminCheck = await isAdmin(request)
  if (!adminCheck) {
    return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '100', 10)))
  const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10))
  const reply_type = searchParams.get('reply_type') || undefined

  try {
    const where: any = {}
    if (reply_type) where.reply_type = reply_type

    const [logs, total] = await Promise.all([
      db.botReplyLog.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          broadcaster_user_id: true,
          trigger_user_id: true,
          trigger_username: true,
          trigger_message: true,
          reply_content: true,
          reply_type: true,
          ai_model: true,
          success: true,
          error_message: true,
          latency_ms: true,
          created_at: true,
        },
      }),
      db.botReplyLog.count({ where }),
    ])

    const serializedLogs = (logs as any[]).map((log: any) => ({
      ...log,
      id: log.id.toString(),
      broadcaster_user_id: log.broadcaster_user_id.toString(),
      trigger_user_id: log.trigger_user_id.toString(),
      created_at: log.created_at.toISOString(),
    }))

    return NextResponse.json({
      logs: serializedLogs,
      total,
      limit,
      offset,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: 'Failed to fetch logs', details: msg }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const adminCheck = await isAdmin(request)
  if (!adminCheck) {
    return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { action } = body

    if (action === 'stats') {
      const now = new Date()
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

      const [total, last24h, lastWeek, byType, successRate] = await Promise.all([
        db.botReplyLog.count(),
        db.botReplyLog.count({ where: { created_at: { gte: oneDayAgo } } }),
        db.botReplyLog.count({ where: { created_at: { gte: oneWeekAgo } } }),
        db.botReplyLog.groupBy({
          by: ['reply_type'],
          _count: true,
          where: { created_at: { gte: oneWeekAgo } },
        }),
        db.botReplyLog.groupBy({
          by: ['success'],
          _count: true,
          where: { created_at: { gte: oneWeekAgo } },
        }),
      ])

      const avgLatency = await db.botReplyLog.aggregate({
        _avg: { latency_ms: true },
        where: { created_at: { gte: oneWeekAgo }, success: true },
      })

      return NextResponse.json({
        stats: {
          total,
          last_24h: last24h,
          last_week: lastWeek,
          by_type: (byType as Array<{ reply_type: string; _count: number }>).map(r => ({ type: r.reply_type, count: r._count })),
          success_rate: successRate,
          avg_latency_ms: avgLatency._avg.latency_ms,
        },
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: 'Failed', details: msg }, { status: 500 })
  }
}
