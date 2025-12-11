import { ADVENT_ITEMS, isDayPast, isDayUnlocked } from '@/lib/advent-calendar'
import { getAuthenticatedUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

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

    // Get drawn status for all days
    let drawnDaysSet = new Set<number>()
    try {
      const drawnDays = await db.adventDayStatus.findMany({
        where: { drawn: true },
        select: {
          day: true,
        },
      })
      drawnDaysSet = new Set(drawnDays.map(d => d.day))
    } catch (err: any) {
      // If the table doesn't exist yet (migration not applied), treat all days as not drawn
      if (err?.code === 'P2021') {
        console.error('AdventDayStatus table missing in database, treating all days as not drawn.')
      } else {
        throw err
      }
    }

    const purchaseMap = new Map(
      purchases.map(p => [p.item_id, p.tickets])
    )

    // Build response with unlock status and purchase counts
    const items = ADVENT_ITEMS.map(item => {
      const isDrawn = drawnDaysSet.has(item.day)
      const isPast = isDayPast(item.day)
      const unlocked = !isDrawn && !isPast && isDayUnlocked(item.day)

      return {
        id: item.id,
        day: item.day,
        pointsCost: item.pointsCost,
        image: item.image,
        maxTickets: item.maxTickets,
        unlocked,
        isPast: isDrawn || isPast,
        userTickets: purchaseMap.get(item.id) || 0,
      }
    })

    return NextResponse.json({ items })
  } catch (error) {
    console.error('Error fetching advent items:', error)
    return NextResponse.json(
      { error: 'Failed to fetch advent items', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
