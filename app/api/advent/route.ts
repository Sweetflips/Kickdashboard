import { ADVENT_ITEMS, isDayUnlocked } from '@/lib/advent-calendar'
import { getAuthenticatedUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const auth = await getAuthenticatedUser(request)
    if (!auth) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get user's purchases for all items
    const purchases = await db.adventPurchase.findMany({
      where: { user_id: auth.userId },
      select: {
        item_id: true,
        tickets: true,
      },
    })

    const purchaseMap = new Map(
      purchases.map(p => [p.item_id, p.tickets])
    )

    // Build response with unlock status and purchase counts
    const items = ADVENT_ITEMS.map(item => ({
      id: item.id,
      day: item.day,
      pointsCost: item.pointsCost,
      image: item.image,
      maxTickets: item.maxTickets,
      unlocked: isDayUnlocked(item.day),
      userTickets: purchaseMap.get(item.id) || 0,
    }))

    return NextResponse.json({ items })
  } catch (error) {
    console.error('Error fetching advent items:', error)
    return NextResponse.json(
      { error: 'Failed to fetch advent items', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
