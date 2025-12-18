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
  const action_type = searchParams.get('action_type') || undefined
  const rule_id = searchParams.get('rule_id') || undefined
  const ai_flagged = searchParams.get('ai_flagged')
  const target_username = searchParams.get('target_username') || undefined

  try {
    const where: any = {}

    if (action_type) where.action_type = action_type
    if (rule_id) where.rule_id = rule_id
    if (ai_flagged === 'true') where.ai_flagged = true
    if (ai_flagged === 'false') where.ai_flagged = false
    if (target_username) {
      where.target_username = { contains: target_username, mode: 'insensitive' }
    }

    const [logs, total] = await Promise.all([
      db.moderationActionLog.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          broadcaster_user_id: true,
          target_user_id: true,
          target_username: true,
          action_type: true,
          duration_seconds: true,
          reason: true,
          rule_id: true,
          ai_flagged: true,
          ai_categories: true,
          ai_max_score: true,
          message_content: true,
          raid_mode_active: true,
          dry_run: true,
          success: true,
          error_message: true,
          created_at: true,
        },
      }),
      db.moderationActionLog.count({ where }),
    ])

    // Convert BigInt to string for JSON serialization
    const serializedLogs = logs.map(log => ({
      ...log,
      id: log.id.toString(),
      broadcaster_user_id: log.broadcaster_user_id.toString(),
      target_user_id: log.target_user_id.toString(),
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

// Get stats/summary
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

      const [
        total,
        last24h,
        lastWeek,
        byActionType,
        byRuleId,
        aiModerated,
        raidModeActions,
      ] = await Promise.all([
        db.moderationActionLog.count(),
        db.moderationActionLog.count({ where: { created_at: { gte: oneDayAgo } } }),
        db.moderationActionLog.count({ where: { created_at: { gte: oneWeekAgo } } }),
        db.moderationActionLog.groupBy({
          by: ['action_type'],
          _count: true,
          where: { created_at: { gte: oneWeekAgo } },
        }),
        db.moderationActionLog.groupBy({
          by: ['rule_id'],
          _count: true,
          where: { created_at: { gte: oneWeekAgo } },
        }),
        db.moderationActionLog.count({ where: { ai_flagged: true, created_at: { gte: oneWeekAgo } } }),
        db.moderationActionLog.count({ where: { raid_mode_active: true, created_at: { gte: oneWeekAgo } } }),
      ])

      return NextResponse.json({
        stats: {
          total,
          last_24h: last24h,
          last_week: lastWeek,
          by_action_type: byActionType.map(r => ({ type: r.action_type, count: r._count })),
          by_rule_id: byRuleId.map(r => ({ rule: r.rule_id || 'unknown', count: r._count })),
          ai_moderated_week: aiModerated,
          raid_mode_actions_week: raidModeActions,
        },
      })
    }

    if (action === 'clear') {
      // Optional: clear old logs (keep last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      const result = await db.moderationActionLog.deleteMany({
        where: { created_at: { lt: thirtyDaysAgo } },
      })
      return NextResponse.json({ ok: true, deleted: result.count })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: 'Failed', details: msg }, { status: 500 })
  }
}
