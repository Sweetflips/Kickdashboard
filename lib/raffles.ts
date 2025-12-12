import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import crypto from 'crypto'
import { buildEntryRanges, deterministicRandomInt, findEntryForIndex } from './raffle-utils'
import { backfillPurchaseTransactionsIfEmpty, ensurePurchaseTransactionsTable } from './purchases-ledger'

export interface PurchaseTicketsResult {
    success: boolean
    error?: string
    ticketsPurchased?: number
    newBalance?: number
}

export interface DrawWinnersResult {
    success: boolean
    error?: string
    winners?: Array<{
        entryId: bigint
        userId: bigint
        username: string
        tickets: number
        selectedTicketIndex?: number
        ticketRangeStart?: number
        ticketRangeEnd?: number
        spinNumber?: number
        isRigged?: boolean
    }>
    drawSeed?: string
    totalTickets?: number
}

/**
 * Purchase tickets for a raffle
 * Atomically deducts Sweet Coins and creates raffle entries
 */
export async function purchaseTickets(
    userId: bigint,
    raffleId: bigint,
    quantity: number
): Promise<PurchaseTicketsResult> {
    try {
        if (quantity <= 0) {
            return {
                success: false,
                error: 'Quantity must be greater than 0',
            }
        }

        // Use transaction to ensure atomicity
        const result = await db.$transaction(async (tx) => {
            await backfillPurchaseTransactionsIfEmpty(tx as any, userId)
            await ensurePurchaseTransactionsTable(tx as any)

            // Lock raffle row for update
            const raffle = await tx.raffle.findUnique({
                where: { id: raffleId },
                select: {
                    id: true,
                    title: true,
                    ticket_cost: true,
                    max_tickets_per_user: true,
                    total_tickets_cap: true,
                    status: true,
                    sub_only: true,
                    start_at: true,
                    end_at: true,
                    hidden_until_start: true,
                },
            })

            if (!raffle) {
                throw new Error('Raffle not found')
            }

            // Check raffle status
            const now = new Date()
            if (raffle.status !== 'active' && raffle.status !== 'upcoming') {
                throw new Error('Raffle is not active')
            }

            if (raffle.hidden_until_start && raffle.start_at > now) {
                throw new Error('Raffle has not started yet')
            }

            if (raffle.end_at <= now) {
                throw new Error('Raffle has ended')
            }

            // Check subscriber requirement
            if (raffle.sub_only) {
                const userPoints = await tx.userSweetCoins.findUnique({
                    where: { user_id: userId },
                    select: { is_subscriber: true },
                })

                if (!userPoints?.is_subscriber) {
                    throw new Error('This raffle is only available to Kick subscribers')
                }
            }

            // Check max tickets per user
            if (raffle.max_tickets_per_user !== null) {
                const existingEntry = await tx.raffleEntry.findUnique({
                    where: {
                        raffle_id_user_id: {
                            raffle_id: raffleId,
                            user_id: userId,
                        },
                    },
                    select: { tickets: true },
                })

                const currentTickets = existingEntry?.tickets || 0
                if (currentTickets + quantity > raffle.max_tickets_per_user) {
                    throw new Error(
                        `Maximum ${raffle.max_tickets_per_user} tickets per user. You already have ${currentTickets} tickets.`
                    )
                }
            }

            // Check total tickets cap
            if (raffle.total_tickets_cap !== null) {
                const totalTicketsResult = await tx.raffleEntry.aggregate({
                    where: { raffle_id: raffleId },
                    _sum: { tickets: true },
                })

                const totalTickets = totalTicketsResult._sum.tickets || 0
                if (totalTickets + quantity > raffle.total_tickets_cap) {
                    throw new Error(
                        `Raffle is sold out. Only ${raffle.total_tickets_cap - totalTickets} tickets remaining.`
                    )
                }
            }

            // Calculate total cost
            const totalCost = raffle.ticket_cost * quantity

            // Lock user Sweet Coins row for update
            const userPoints = await tx.$queryRaw<Array<{
                id: bigint
                user_id: bigint
                total_sweet_coins: number
            }>>`
                SELECT id, user_id, total_sweet_coins
                FROM user_sweet_coins
                WHERE user_id = ${userId}
                FOR UPDATE
            `

            if (!userPoints || userPoints.length === 0) {
                throw new Error('User Sweet Coins record not found')
            }

            const currentBalance = userPoints[0].total_sweet_coins

            if (currentBalance < totalCost) {
                throw new Error(`Not enough Sweet Coins. You have ${currentBalance} Sweet Coins, need ${totalCost} Sweet Coins.`)
            }

            // Deduct Sweet Coins
            await tx.userSweetCoins.update({
                where: { user_id: userId },
                data: {
                    total_sweet_coins: {
                        decrement: totalCost,
                    },
                    updated_at: new Date(),
                },
            })

            // Create or update raffle entry
            const existingEntry = await tx.raffleEntry.findUnique({
                where: {
                    raffle_id_user_id: {
                        raffle_id: raffleId,
                        user_id: userId,
                    },
                },
            })

            if (existingEntry) {
                await tx.raffleEntry.update({
                    where: { id: existingEntry.id },
                    data: {
                        tickets: {
                            increment: quantity,
                        },
                    },
                })
            } else {
                await tx.raffleEntry.create({
                    data: {
                        raffle_id: raffleId,
                        user_id: userId,
                        tickets: quantity,
                    },
                })
            }

            // Log transaction (for purchase history)
            await tx.$executeRaw`
              INSERT INTO purchase_transactions (
                user_id, type, quantity, points_spent, item_name, advent_item_id, raffle_id, metadata
              )
              VALUES (
                ${userId}, ${'raffle_ticket'}, ${quantity}, ${totalCost}, ${raffle.title}, NULL, ${raffleId}, NULL
              )
            `

            // Get updated balance
            const updatedPoints = await tx.userSweetCoins.findUnique({
                where: { user_id: userId },
                select: { total_sweet_coins: true },
            })

            return {
                success: true,
                ticketsPurchased: quantity,
                newBalance: updatedPoints?.total_sweet_coins || 0,
            }
        }, {
            maxWait: 20000,
            timeout: 30000,
            isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        })

        return result
    } catch (error) {
        console.error('Error purchasing tickets:', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }
    }
}

/**
 * Draw winners for a raffle using secure RNG
 * Returns winners and stores draw seed for transparency
 */
export async function drawWinners(
    raffleId: bigint,
    numberOfWinners: number
): Promise<DrawWinnersResult> {
    try {
        if (numberOfWinners <= 0) {
            return {
                success: false,
                error: 'Number of winners must be greater than 0',
            }
        }

        const result = await db.$transaction(async (tx) => {
            // Lock raffle
            const raffle = await tx.raffle.findUnique({
                where: { id: raffleId },
                select: {
                    id: true,
                    status: true,
                    end_at: true,
                },
            })

            if (!raffle) {
                throw new Error('Raffle not found')
            }

            if (raffle.status === 'completed' || raffle.status === 'drawing') {
                throw new Error('Winners have already been drawn for this raffle')
            }

            // Get all entries with ticket counts
            const entries = await tx.raffleEntry.findMany({
                where: { raffle_id: raffleId },
                include: {
                    user: {
                        select: {
                            id: true,
                            username: true,
                        },
                    },
                },
            })

            if (entries.length === 0) {
                throw new Error('No entries found for this raffle')
            }


            // Build prefix-sum ranges for entries (each ticket = one index)
            const mappedEntries = entries.map(e => ({ id: e.id, userId: e.user.id, username: e.user.username, tickets: e.tickets }))
            const { ranges, totalTickets } = buildEntryRanges(mappedEntries)

            if (totalTickets === 0) {
                throw new Error('No tickets found for this raffle')
            }

            // Generate secure random seed
            const drawSeed = crypto.randomBytes(32).toString('hex')
            const timestamp = Date.now()


            // Fetch rigged winners (if enabled)
            let riggedRecords: Array<{ entry_id: bigint; position: number }> = []
            try {
                if ((await tx.raffle.findUnique({ where: { id: raffleId }, select: { rigging_enabled: true } }))?.rigging_enabled) {
                    riggedRecords = await tx.raffleRiggedWinner.findMany({
                        where: { raffle_id: raffleId },
                        orderBy: { position: 'asc' },
                        select: { entry_id: true, position: true },
                    })
                }
            } catch (err) {
                // If rigging table doesn't exist or any error, we'll just skip rigging
                console.warn('Rigging check failed, skipping rigged options:', err)
                riggedRecords = []
            }

            // Select winners using deterministic RNG and prefix-sum ranges
            const winners: Array<{ entryId: bigint; userId: bigint; username: string; tickets: number; selectedTicketIndex: number; ticketRangeStart: number; ticketRangeEnd: number; spinNumber: number; isRigged: boolean }> = []
            const selectedEntryIds = new Set<bigint>()
            const allowDuplicates = numberOfWinners > entries.length

            let spinCounter = 0
            while (winners.length < numberOfWinners) {
                // Use deterministic RNG derived from seed + spinCounter
                // If rigged winner exists for this spin number pick that entry instead
                let randomIndex: number
                let isRigged = false
                const rigSlot = riggedRecords[winners.length]
                if (rigSlot) {
                    // Find the rigged entry range
                    const rigEntry = ranges.find(r => r.entryId === rigSlot.entry_id)
                    if (rigEntry) {
                        // Pick a deterministic index within the rigEntry range
                        const entryTicketCount = rigEntry.rangeEnd - rigEntry.rangeStart
                        const offset = deterministicRandomInt(drawSeed, spinCounter, entryTicketCount)
                        randomIndex = rigEntry.rangeStart + offset
                        isRigged = true
                    } else {
                        // rigged entry not found (removed), fallback to normal selection
                        randomIndex = deterministicRandomInt(drawSeed, spinCounter, totalTickets)
                    }
                } else {
                    randomIndex = deterministicRandomInt(drawSeed, spinCounter, totalTickets)
                }

                const entryRange = findEntryForIndex(ranges, randomIndex)
                if (!entryRange) {
                    throw new Error('Failed to map index to entry')
                }

                // Skip duplicates if not allowed
                if (!allowDuplicates && selectedEntryIds.has(entryRange.entryId)) {
                    spinCounter += 1
                    continue
                }

                selectedEntryIds.add(entryRange.entryId)

                winners.push({
                    entryId: entryRange.entryId,
                    userId: entryRange.userId,
                    username: entryRange.username,
                    tickets: entryRange.tickets,
                    selectedTicketIndex: randomIndex,
                    ticketRangeStart: entryRange.rangeStart,
                    ticketRangeEnd: entryRange.rangeEnd,
                    spinNumber: winners.length + 1,
                    isRigged: isRigged,
                })

                spinCounter += 1
            }

            if (winners.length === 0) {
                throw new Error('Failed to select winners')
            }

            // Update raffle status and store draw seed
            await tx.raffle.update({
                where: { id: raffleId },
                data: {
                    status: 'completed',
                    draw_seed: drawSeed,
                    drawn_at: new Date(),
                },
            })


            // Create winner records and persist selected ticket index and spin number if schema allows
            for (const winner of winners) {
                await tx.raffleWinner.create({
                    data: {
                        raffle_id: raffleId,
                        entry_id: winner.entryId,
                        selected_ticket_index: BigInt(winner.selectedTicketIndex),
                        spin_number: winner.spinNumber,
                        is_rigged: winner.isRigged,
                    } as any,
                })
            }

            return {
                success: true,
                winners: winners.map(w => ({
                    entryId: w.entryId,
                    userId: w.userId,
                    username: w.username,
                    tickets: w.tickets,
                    selectedTicketIndex: w.selectedTicketIndex,
                    ticketRangeStart: w.ticketRangeStart,
                    ticketRangeEnd: w.ticketRangeEnd,
                    spinNumber: w.spinNumber,
                    isRigged: w.isRigged,
                })),
                drawSeed,
                totalTickets,
            }
        }, {
            maxWait: 20000,
            timeout: 30000,
            isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        })

        return result
    } catch (error) {
        console.error('Error drawing winners:', error)
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }
    }
}
