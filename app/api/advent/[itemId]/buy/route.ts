import { ADVENT_ITEMS, isDayPast, isDayUnlocked } from '@/lib/advent-calendar'
import { getAuthenticatedUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { backfillPurchaseTransactionsIfEmpty, ensurePurchaseTransactionsTable } from '@/lib/purchases-ledger'
import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

class ApiError extends Error {
  status: number
  code?: string

  constructor(message: string, status: number = 400, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError && typeof err.status === 'number'
}

export async function POST(
  request: Request,
  { params }: { params: { itemId: string } }
) {
  try {
    // Check if request was aborted before processing
    if (request.signal?.aborted) {
      return new NextResponse(null, { status: 499 }) // Client Closed Request
    }

    const auth = await getAuthenticatedUser(request)
    if (!auth) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    let body
    try {
      body = await request.json()
    } catch (err) {
      // Handle case where request body can't be read (connection closed, etc.)
      if (err instanceof Error && (('code' in err && (err as any).code === 'ECONNRESET') || err.message === 'aborted')) {
        return new NextResponse(null, { status: 499 })
      }
      throw err
    }

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

    // Check if day is past (next day has started)
    if (isDayPast(item.day)) {
      return NextResponse.json(
        { error: `Day ${item.day} has already passed and is closed` },
        { status: 400 }
      )
    }

    // Check if day is unlocked
    if (!isDayUnlocked(item.day)) {
      return NextResponse.json(
        { error: `Day ${item.day} has not unlocked yet` },
        { status: 400 }
      )
    }

    // Use transaction to ensure atomicity
    const result = await db.$transaction(async (tx: any) => {
      await backfillPurchaseTransactionsIfEmpty(tx as any, auth.userId)
      await ensurePurchaseTransactionsTable(tx as any)

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
        throw new ApiError(
          `Maximum ${item.maxTickets} tickets per user for this item. You already have ${currentTickets} tickets.`
        )
      }

      // Lock user Sweet Coins row for update
      const userPoints = await tx.$queryRaw<Array<{
        id: bigint
        user_id: bigint
        total_sweet_coins: number
      }>>`
        SELECT id, user_id, total_sweet_coins
        FROM user_sweet_coins
        WHERE user_id = ${auth.userId}
        FOR UPDATE
      `

      if (!userPoints || userPoints.length === 0) {
        throw new ApiError('User Sweet Coins record not found', 500, 'missing_sweet_coins_record')
      }

      const currentBalance = userPoints[0].total_sweet_coins
      const totalCost = item.pointsCost * quantity
      const itemName = `Day ${item.day} – Advent Ticket`

      if (currentBalance < totalCost) {
        throw new ApiError(
          `Not enough Sweet Coins. You have ${currentBalance} Sweet Coins, need ${totalCost} Sweet Coins.`,
          400,
          'insufficient_sweet_coins'
        )
      }

      // Deduct Sweet Coins
      await tx.userSweetCoins.update({
        where: { user_id: auth.userId },
        data: {
          total_sweet_coins: {
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

      // Log transaction (for purchase history)
      await tx.$executeRaw`
        INSERT INTO purchase_transactions (
          user_id, type, quantity, sweet_coins_spent, item_name, advent_item_id, raffle_id, metadata
        )
        VALUES (
          ${auth.userId}, ${'advent_ticket'}, ${quantity}, ${totalCost}, ${itemName}, ${itemId}, NULL, NULL
        )
      `

      // Get updated balance
      const updatedPoints = await tx.userSweetCoins.findUnique({
        where: { user_id: auth.userId },
        select: { total_sweet_coins: true },
      })

      return {
        success: true,
        ticketsPurchased: quantity,
        newBalance: updatedPoints?.total_sweet_coins || 0,
        totalTickets: newTotalTickets,
      }
    }, {
      maxWait: 20000,
      timeout: 30000,
      isolationLevel: 'ReadCommitted',
    })

    return NextResponse.json({
      success: true,
      tickets_purchased: result.ticketsPurchased,
      new_balance: result.newBalance,
      total_tickets: result.totalTickets,
    })
  } catch (error) {
    // Handle connection reset/aborted requests gracefully
    // These happen when the client disconnects before the request completes
    const isConnectionError = error instanceof Error && (
      ('code' in error && (error as any).code === 'ECONNRESET') ||
      error.message === 'aborted' ||
      error.message.includes('aborted')
    )

    if (isConnectionError) {
      // Connection was closed by client - this is expected behavior, not an error
      // Don't log it or try to send a response
      // Return 499 (Client Closed Request) if possible, otherwise let Next.js handle it
      try {
        return new NextResponse(null, { status: 499 })
      } catch {
        // Connection already closed, can't send response - throw to let Next.js handle it
        throw error
      }
    }

    // Handle unique constraint violation (shouldn't happen with transaction, but handle gracefully)
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        { error: 'Purchase already exists. Please try again.' },
        { status: 400 }
      )
    }

    // Expected client errors: don't spam logs with stack traces
    if (isApiError(error)) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      )
    }

    console.error('Error purchasing advent item:', error)

    return NextResponse.json(
      { error: 'Failed to purchase item' },
      { status: 500 }
    )
  }
}
