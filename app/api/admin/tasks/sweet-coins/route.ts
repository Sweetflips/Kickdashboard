import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/auth'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

type Status = 'all' | 'pending' | 'processing' | 'completed' | 'failed'

function parseStatus(s: string | null): Status {
  const v = (s || 'all').toLowerCase()
  if (v === 'pending' || v === 'processing' || v === 'completed' || v === 'failed' || v === 'all') return v
  return 'all'
}

export async function GET(request: Request) {
  try {
    const adminCheck = await isAdmin(request)
    if (!adminCheck) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50')))
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0'))
    const status = parseStatus(searchParams.get('status'))
    const q = (searchParams.get('q') || '').trim()
    const onlyStale = (searchParams.get('onlyStale') || '').toLowerCase() === 'true'
    const sinceHours = Math.max(0, parseInt(searchParams.get('sinceHours') || '0'))

    const prisma = db as any
    const where: any = {}
    if (status !== 'all') where.status = status
    if (onlyStale) {
      where.status = 'processing'
      where.locked_at = { lt: new Date(Date.now() - 5 * 60 * 1000) }
    }
    if (sinceHours > 0) {
      where.created_at = { gte: new Date(Date.now() - sinceHours * 60 * 60 * 1000) }
    }

    // Search: message_id substring, kick_user_id exact, and username lookup (best-effort)
    if (q) {
      const or: any[] = [{ message_id: { contains: q, mode: 'insensitive' } }]

      if (/^\d+$/.test(q)) {
        try {
          or.push({ kick_user_id: BigInt(q) })
        } catch {
          // ignore
        }
      }

      // If it looks like a username, resolve kick_user_ids matching that username
      if (!/^\d+$/.test(q)) {
        const matchingUsers = await prisma.user.findMany({
          where: { username: { contains: q, mode: 'insensitive' } },
          select: { kick_user_id: true, username: true },
          take: 50,
        })
        const ids = (matchingUsers as any[]).map((u: any) => u.kick_user_id)
        if (ids.length > 0) {
          or.push({ kick_user_id: { in: ids } })
        }
      }

      where.OR = or
    }

    const [rows, total] = await Promise.all([
      prisma.sweetCoinAwardJob.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.sweetCoinAwardJob.count({ where }),
    ])

    // Best-effort username map (no FK relation in schema)
    const kickIds = Array.from(new Set((rows as any[]).map((r: any) => r.kick_user_id.toString()))).slice(0, 200)
    const users = kickIds.length
      ? await prisma.user.findMany({
          where: { kick_user_id: { in: kickIds.map((id: any) => BigInt(id)) } },
          select: { kick_user_id: true, username: true },
        })
      : []
    const usernameByKickId = new Map((users as any[]).map((u: any) => [u.kick_user_id.toString(), u.username]))

    return NextResponse.json({
      success: true,
      total,
      limit,
      offset,
      jobs: (rows as any[]).map((r: any) => ({
        type: 'sweet_coins' as const,
        id: r.id.toString(),
        status: r.status,
        attempts: r.attempts,
        message_id: r.message_id,
        kick_user_id: r.kick_user_id.toString(),
        username: usernameByKickId.get(r.kick_user_id.toString()) || null,
        stream_session_id: r.stream_session_id?.toString() || null,
        locked_at: r.locked_at?.toISOString() || null,
        processed_at: r.processed_at?.toISOString() || null,
        created_at: r.created_at.toISOString(),
        updated_at: r.updated_at.toISOString(),
        last_error: r.last_error || null,
        badges_count: Array.isArray(r.badges) ? (r.badges as any[]).length : null,
        emotes_count: Array.isArray(r.emotes) ? (r.emotes as any[]).length : null,
      })),
    })
  } catch (error) {
    console.error('Error listing sweet coin jobs:', error)
    return NextResponse.json(
      { error: 'Failed to list sweet coin jobs', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
