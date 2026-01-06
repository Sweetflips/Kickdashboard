import { ADVENT_ITEMS, isDayPast } from '@/lib/advent-calendar'
import { getAuthenticatedUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { backfillMissingPurchaseTransactions } from '@/lib/purchases-ledger'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

type TxRow = {
  id: bigint
  type: string
  quantity: number
  sweet_coins_spent: number
  item_name: string
  advent_item_id: string | null
  raffle_id: bigint | null
  created_at: Date
}

type Status = 'Active' | 'Closed – Awaiting Draw' | 'Raffle Drawn' | 'Expired'

function parseRange(range: string | null): { from: Date | null } {
  const now = new Date()
  switch (range) {
    case 'last7':
    case 'last_7_days':
    default: {
      const d = new Date(now)
      d.setUTCDate(d.getUTCDate() - 7)
      return { from: d }
    }
    case 'last30':
    case 'last_30_days': {
      const d = new Date(now)
      d.setUTCDate(d.getUTCDate() - 30)
      return { from: d }
    }
    case 'month':
    case 'this_month': {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0))
      return { from: d }
    }
    case 'year':
    case 'this_year': {
      const d = new Date(Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0))
      return { from: d }
    }
    case 'all':
    case 'all_time': {
      return { from: null }
    }
  }
}

function typeLabel(t: string) {
  switch (t) {
    case 'advent_ticket':
      return 'Advent Calendar Ticket'
    case 'raffle_ticket':
      return 'Raffle Ticket'
    default:
      return t
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const sp = request.nextUrl.searchParams

    const type = (sp.get('type') || 'all').toLowerCase()
    const range = sp.get('range') || 'last7'
    const search = (sp.get('search') || '').trim().toLowerCase()
    const page = Math.max(1, parseInt(sp.get('page') || '1', 10) || 1)
    const pageSize = 20

    const { from } = parseRange(range)

    const typeFilterSql = (() => {
      if (type === 'all') return null
      if (type === 'advent' || type === 'advent_calendar_tickets') return 'advent_ticket'
      if (type === 'raffle' || type === 'raffle_tickets') return 'raffle_ticket'
      return null
    })()

    const { rows } = await (db as any).$transaction(async (tx: any) => {
      await backfillMissingPurchaseTransactions(tx as any, auth.userId)
      const rows = await tx.$queryRaw<TxRow[]>`
        SELECT id, type, quantity, sweet_coins_spent, item_name, advent_item_id, raffle_id, created_at
        FROM purchase_transactions
        WHERE user_id = ${auth.userId}
          AND (${from}::timestamptz IS NULL OR created_at >= ${from}::timestamptz)
          AND (${typeFilterSql}::text IS NULL OR type = ${typeFilterSql}::text)
        ORDER BY created_at DESC
        LIMIT 2000
      `
      return { rows }
    })

    type Group = {
      key: string
      item: string
      type: string
      totalQuantity: number
      totalSweetCoinsSpent: number
      transactions: Array<{
        id: string
        created_at: string
        quantity: number
        sweet_coins_spent: number
      }>
      transactionsCount: number
      lastPurchased: string
      status: Status
      raffle_id: string | null
      advent_item_id: string | null
    }

    const groupsMap = new Map<string, Group>()

    for (const r of rows) {
      const key = `${r.type}:${r.raffle_id ? `raffle:${r.raffle_id.toString()}` : r.advent_item_id ? `advent:${r.advent_item_id}` : `name:${r.item_name}`}`
      const existing = groupsMap.get(key)

      const tx = {
        id: r.id.toString(),
        created_at: r.created_at.toISOString(),
        quantity: r.quantity,
        sweet_coins_spent: r.sweet_coins_spent,
      }

      if (!existing) {
        groupsMap.set(key, {
          key,
          item: r.item_name,
          type: typeLabel(r.type),
          totalQuantity: r.quantity,
          totalSweetCoinsSpent: r.sweet_coins_spent,
          transactions: [tx],
          transactionsCount: 1,
          lastPurchased: tx.created_at,
          status: 'Active',
          raffle_id: r.raffle_id ? r.raffle_id.toString() : null,
          advent_item_id: r.advent_item_id,
        })
      } else {
        existing.totalQuantity += r.quantity
        existing.totalSweetCoinsSpent += r.sweet_coins_spent
        existing.transactions.push(tx)
        existing.transactionsCount += 1
        if (tx.created_at > existing.lastPurchased) existing.lastPurchased = tx.created_at
      }
    }

    // Status resolution
    const raffleIds = [...new Set([...groupsMap.values()].map(g => g.raffle_id).filter(Boolean) as string[])]
    const raffleIdBigints = raffleIds.map(id => BigInt(id))
    const raffles = raffleIdBigints.length
      ? await db.raffle.findMany({
          where: { id: { in: raffleIdBigints } },
          select: { id: true, status: true, end_at: true, drawn_at: true },
        })
      : []
    const raffleById = new Map<string, { status: string; end_at: Date; drawn_at: Date | null }>(
      raffles.map((r: { id: bigint; status: string; end_at: Date; drawn_at: Date | null }) => [r.id.toString(), { status: r.status, end_at: r.end_at, drawn_at: r.drawn_at }])
    )

    // Advent day status table removed - treat no days as drawn
    const drawnSet = new Set<number>()

    for (const g of groupsMap.values()) {
      if (g.raffle_id) {
        const r = raffleById.get(g.raffle_id)
        if (!r) {
          g.status = 'Expired'
        } else if (r.status === 'completed' || r.drawn_at) {
          g.status = 'Raffle Drawn'
        } else if (r.status === 'drawing') {
          g.status = 'Closed – Awaiting Draw'
        } else if (r.status === 'cancelled') {
          g.status = 'Expired'
        } else {
          g.status = 'Active'
        }
      } else if (g.advent_item_id) {
        const item = ADVENT_ITEMS.find(i => i.id === g.advent_item_id)
        if (!item) {
          g.status = 'Expired'
        } else if (drawnSet.has(item.day)) {
          g.status = 'Raffle Drawn'
        } else if (isDayPast(item.day)) {
          g.status = 'Closed – Awaiting Draw'
        } else {
          g.status = 'Active'
        }
      }
    }

    let groups = [...groupsMap.values()]

    if (search) {
      groups = groups.filter(g => g.item.toLowerCase().includes(search))
    }

    groups.sort((a, b) => (a.lastPurchased < b.lastPurchased ? 1 : -1))

    const totalGroups = groups.length
    const totalPages = Math.max(1, Math.ceil(totalGroups / pageSize))
    const safePage = Math.min(page, totalPages)
    const start = (safePage - 1) * pageSize
    const pageItems = groups.slice(start, start + pageSize)

    return NextResponse.json({
      groups: pageItems,
      page: safePage,
      pageSize,
      totalGroups,
      totalPages,
      range,
      type,
      search,
    })
  } catch (error) {
    console.error('Error fetching purchase history:', error)
    return NextResponse.json(
      { error: "We couldn't load your purchase history. Please refresh the page or try again later." },
      { status: 500 }
    )
  }
}
