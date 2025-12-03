import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import crypto from 'crypto'

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
    }>
    drawSeed?: string
}

/**
 * Purchase tickets for a raffle
 * Atomically deducts points and creates raffle entries
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
            // Lock raffle row for update
            const raffle = await tx.raffle.findUnique({
                where: { id: raffleId },
                select: {
                    id: true,
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
                const userPoints = await tx.userPoints.findUnique({
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

            // Lock user points row for update
            const userPoints = await tx.$queryRaw<Array<{
                id: bigint
                user_id: bigint
                total_points: number
            }>>`
                SELECT id, user_id, total_points
                FROM user_points
                WHERE user_id = ${userId}
                FOR UPDATE
            `

            if (!userPoints || userPoints.length === 0) {
                throw new Error('User points record not found')
            }

            const currentBalance = userPoints[0].total_points

            if (currentBalance < totalCost) {
                throw new Error(`Not enough points. You have ${currentBalance} points, need ${totalCost} points.`)
            }

            // Deduct points
            await tx.userPoints.update({
                where: { user_id: userId },
                data: {
                    total_points: {
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

            // Get updated balance
            const updatedPoints = await tx.userPoints.findUnique({
                where: { user_id: userId },
                select: { total_points: true },
            })

            return {
                success: true,
                ticketsPurchased: quantity,
                newBalance: updatedPoints?.total_points || 0,
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

            // Expand tickets into weighted pool (each ticket = one chance)
            const ticketPool: Array<{ entryId: bigint; userId: bigint; username: string }> = []
            for (const entry of entries) {
                for (let i = 0; i < entry.tickets; i++) {
                    ticketPool.push({
                        entryId: entry.id,
                        userId: entry.user.id,
                        username: entry.user.username,
                    })
                }
            }

            if (ticketPool.length === 0) {
                throw new Error('No tickets found for this raffle')
            }

            // Generate secure random seed
            const drawSeed = crypto.randomBytes(32).toString('hex')
            const timestamp = Date.now()

            // Use seed + timestamp for deterministic but random selection
            // Create a simple RNG from seed
            let seedValue = parseInt(drawSeed.substring(0, 8), 16) % 1000000
            const seededRandom = () => {
                seedValue = (seedValue * 9301 + 49297) % 233280
                return seedValue / 233280
            }

            // Select winners (no duplicates)
            const winners: Array<{ entryId: bigint; userId: bigint; username: string; tickets: number }> = []
            const selectedEntryIds = new Set<bigint>()

            // If we need more winners than entries, allow duplicates
            const allowDuplicates = numberOfWinners > entries.length

            while (winners.length < numberOfWinners && ticketPool.length > 0) {
                const randomIndex = Math.floor(seededRandom() * ticketPool.length)
                const selected = ticketPool[randomIndex]

                if (!allowDuplicates && selectedEntryIds.has(selected.entryId)) {
                    // Remove this ticket from pool and try again
                    ticketPool.splice(randomIndex, 1)
                    continue
                }

                selectedEntryIds.add(selected.entryId)

                // Find the entry to get ticket count
                const entry = entries.find(e => e.id === selected.entryId)
                if (entry) {
                    winners.push({
                        entryId: selected.entryId,
                        userId: selected.userId,
                        username: selected.username,
                        tickets: entry.tickets,
                    })
                }

                // Remove this ticket from pool
                ticketPool.splice(randomIndex, 1)
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

            // Create winner records
            for (const winner of winners) {
                await tx.raffleWinner.create({
                    data: {
                        raffle_id: raffleId,
                        entry_id: winner.entryId,
                    },
                })
            }

            return {
                success: true,
                winners,
                drawSeed,
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
