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

function getPayloadPreview(payload: any): { content: string | null; sender: string | null; broadcaster: string | null } {
  const content = typeof payload?.content === 'string' ? payload.content : null
  const sender = typeof payload?.sender?.username === 'string' ? payload.sender.username : null
  const broadcaster = typeof payload?.broadcaster?.username === 'string' ? payload.broadcaster.username : null
  return { content, sender, broadcaster }
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

    const where: any = {}
    if (status !== 'all') where.status = status
    if (onlyStale) {
      where.status = 'processing'
      where.locked_at = { lt: new Date(Date.now() - 5 * 60 * 1000) }
    }
    if (sinceHours > 0) {
      where.created_at = { gte: new Date(Date.now() - sinceHours * 60 * 60 * 1000) }
    }

    // Search: message_id, sender/broadcaster user ids, and (best-effort) usernames via payload
    if (q) {
      const or: any[] = [{ message_id: { contains: q, mode: 'insensitive' } }]

      if (/^\d+$/.test(q)) {
        try {
          const id = BigInt(q)
          or.push({ sender_user_id: id })
          or.push({ broadcaster_user_id: id })
          or.push({ stream_session_id: id })
        } catch {
          // ignore
        }
      }

      // Prisma JSON filtering varies by provider; keep it conservative:
      // We'll rely on message_id + ids for DB filtering and do a secondary in-memory match on usernames/content.
      where.OR = or
    }

    const [rows, total] = await Promise.all([
      db.chatJob.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: limit,
        skip: offset,
      }),
      db.chatJob.count({ where }),
    ])

    const loweredQ = q.toLowerCase()
    const filtered = q
      ? rows.filter(r => {
          const p = r.payload as any
          const prev = getPayloadPreview(p)
          if (prev.sender?.toLowerCase().includes(loweredQ)) return true
          if (prev.broadcaster?.toLowerCase().includes(loweredQ)) return true
          if (prev.content?.toLowerCase().includes(loweredQ)) return true
          return true // keep if it matched DB OR already
        })
      : rows

    return NextResponse.json({
      success: true,
      total,
      limit,
      offset,
      jobs: filtered.map(r => {
        const p = r.payload as any
        const prev = getPayloadPreview(p)
        return {
          type: 'chat' as const,
          id: r.id.toString(),
          status: r.status,
          attempts: r.attempts,
          message_id: r.message_id,
          sender_user_id: r.sender_user_id.toString(),
          sender_username: prev.sender,
          broadcaster_user_id: r.broadcaster_user_id.toString(),
          broadcaster_username: prev.broadcaster,
          stream_session_id: r.stream_session_id?.toString() || null,
          content_preview: prev.content ? prev.content.slice(0, 140) : null,
          locked_at: r.locked_at?.toISOString() || null,
          processed_at: r.processed_at?.toISOString() || null,
          created_at: r.created_at.toISOString(),
          updated_at: r.updated_at.toISOString(),
          last_error: r.last_error || null,
        }
      }),
    })
  } catch (error) {
    console.error('Error listing chat jobs:', error)
    return NextResponse.json(
      { error: 'Failed to list chat jobs', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
