import { ADVENT_ITEMS, isDayPast, isDayUnlocked } from '@/lib/advent-calendar'
import { getAuthenticatedUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'

export async function POST(
  request: Request,
  { params }: { params: { itemId: string } }
) {
  try {
    const auth = await getAuthenticatedUser(request)
    if (!auth) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { quantity } = body

    if (!quantity || quantity <= 0) {
      return NextResponse.json(
        { error: 'Invalid quantity' },
        { status: 400 }
      )
    }

    const itemId = params.itemId
    const item = ADVENT_ITEMS.find(i => i.id === itemId)

    if (!item) {
      return NextResponse.json(
        { error: 'Item not found' },
        { status: 404 }
      )
    }

    // Check if day is past (drawn/closed)
    if (isDayPast(item.day)) {
      return NextResponse.json(
        { error: `Day ${item.day} has already passed and is closed` },
        { status: 400 }
      )
    }

    // Check if day is unlocked (only current day is unlocked)
    if (!isDayUnlocked(item.day)) {
      return NextResponse.json(
        { error: `Day ${item.day} has not unlocked yet` },
        { status: 400 }
      )
    }

    // Use transaction to ensure atomicity
    const result = await db.$transaction(async (tx) => {
      // Get current purchase count
      const existingPurchase = await tx.adventPurchase.findUnique({
        where: {
          user_id_item_id: {
            user_id: auth.userId,
            item_id: itemId,
          },
        },
        select: { tickets: true },
      })

      const currentTickets = existingPurchase?.tickets || 0
      const newTotalTickets = currentTickets + quantity

      // Check max tickets limit
      if (newTotalTickets > item.maxTickets) {
        throw new Error(
          `Maximum ${item.maxTickets} tickets per user for this item. You already have ${currentTickets} tickets.`
        )
      }

      // Lock user points row for update
      const userPoints = await tx.$queryRaw<Array<{
        id: bigint
        user_id: bigint
        total_points: number
      }>>`
        SELECT id, user_id, total_points
        FROM user_points
        WHERE user_id = ${auth.userId}
        FOR UPDATE
      `

      if (!userPoints || userPoints.length === 0) {
        throw new Error('User points record not found')
      }

      const currentBalance = userPoints[0].total_points
      const totalCost = item.pointsCost * quantity

      if (currentBalance < totalCost) {
        throw new Error(`Not enough points. You have ${currentBalance} points, need ${totalCost} points.`)
      }

      // Deduct points
      await tx.userPoints.update({
        where: { user_id: auth.userId },
        data: {
          total_points: {
            decrement: totalCost,
          },
          updated_at: new Date(),
        },
      })

      // Create or update purchase record
      if (existingPurchase) {
        await tx.adventPurchase.update({
          where: {
            user_id_item_id: {
              user_id: auth.userId,
              item_id: itemId,
            },
          },
          data: {
            tickets: {
              increment: quantity,
            },
          },
        })
      } else {
        await tx.adventPurchase.create({
          data: {
            user_id: auth.userId,
            item_id: itemId,
            tickets: quantity,
          },
        })
      }

      // Get updated balance
      const updatedPoints = await tx.userPoints.findUnique({
        where: { user_id: auth.userId },
        select: { total_points: true },
      })

      return {
        success: true,
        ticketsPurchased: quantity,
        newBalance: updatedPoints?.total_points || 0,
        totalTickets: newTotalTickets,
      }
    }, {
      maxWait: 20000,
      timeout: 30000,
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    })

    return NextResponse.json({
      success: true,
      tickets_purchased: result.ticketsPurchased,
      new_balance: result.newBalance,
      total_tickets: result.totalTickets,
    })
  } catch (error) {
    console.error('Error purchasing advent item:', error)

    // Handle unique constraint violation (shouldn't happen with transaction, but handle gracefully)
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        { error: 'Purchase already exists. Please try again.' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to purchase item' },
      { status: 400 }
    )
  }
}
