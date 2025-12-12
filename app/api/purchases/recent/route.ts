import { getAuthenticatedUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { backfillMissingPurchaseTransactions } from '@/lib/purchases-ledger'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

type Row = {
  id: bigint
  type: string
  quantity: number
  points_spent: number
  item_name: string
  advent_item_id: string | null
  raffle_id: bigint | null
  created_at: Date
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request)
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sp = request.nextUrl.searchParams
    const limitRaw = sp.get('limit')
    const limit = Math.max(1, Math.min(50, limitRaw ? parseInt(limitRaw, 10) : 10))

    const { rows } = await db.$transaction(async (tx) => {
      await backfillMissingPurchaseTransactions(tx as any, auth.userId)
      const rows = await tx.$queryRaw<Row[]>`
        SELECT id, type, quantity, points_spent, item_name, advent_item_id, raffle_id, created_at
        FROM purchase_transactions
        WHERE user_id = ${auth.userId}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `
      return { rows }
    })

    return NextResponse.json({
      purchases: rows.map(r => ({
        id: r.id.toString(),
        type: r.type,
        quantity: r.quantity,
        points_spent: r.points_spent,
        item_name: r.item_name,
        advent_item_id: r.advent_item_id,
        raffle_id: r.raffle_id ? r.raffle_id.toString() : null,
        created_at: r.created_at.toISOString(),
      })),
    })
  } catch (error) {
    console.error('Error fetching recent purchases:', error)
    return NextResponse.json(
      { error: 'Failed to fetch recent purchases', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
