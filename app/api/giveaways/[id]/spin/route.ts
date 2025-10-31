import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthenticatedUser } from '@/lib/auth'
import { selectWeightedWinner, type WeightedEntry } from '@/lib/giveaway'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthenticatedUser(request)
    if (!auth) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const giveawayId = BigInt(params.id)

    // Verify giveaway exists and user owns it
    const giveaway = await db.giveaway.findFirst({
      where: {
        id: giveawayId,
        broadcaster_user_id: auth.kickUserId,
      },
      include: {
        segments: {
          orderBy: {
            order_index: 'asc',
          },
        },
        entries: {
          include: {
            user: {
              select: {
                username: true,
                kick_user_id: true,
                profile_picture_url: true,
              },
            },
          },
        },
        winners: true,
      },
    })

    if (!giveaway) {
      return NextResponse.json(
        { error: 'Giveaway not found' },
        { status: 404 }
      )
    }

    if (giveaway.status !== 'active') {
      return NextResponse.json(
        { error: 'Giveaway must be active to spin' },
        { status: 400 }
      )
    }

    if (giveaway.entries.length === 0) {
      return NextResponse.json(
        { error: 'No entries to select from' },
        { status: 400 }
      )
    }

    if (giveaway.winners.length > 0) {
      return NextResponse.json(
        { error: 'Winner already selected' },
        { status: 400 }
      )
    }

    // Select multiple winners based on number_of_winners
    const numberOfWinners = giveaway.number_of_winners || 1
    const winners: Array<{ entryId: bigint; userId: bigint }> = []

    // Create a copy of entries for selection (we'll remove winners as we go)
    let remainingEntries = [...giveaway.entries]
    const selectedEntryIds = new Set<bigint>()

    for (let i = 0; i < numberOfWinners && remainingEntries.length > 0; i++) {
      // Convert remaining entries to WeightedEntry format
      const weightedEntries: WeightedEntry[] = remainingEntries
        .filter(entry => !selectedEntryIds.has(entry.id))
        .map(entry => ({
          entryId: entry.id,
          userId: entry.user_id,
          points: entry.points_at_entry, // This represents number of tickets
        }))

      if (weightedEntries.length === 0) break

      // Select winner based on points (weighted by tickets)
      const winnerEntryId = selectWeightedWinner(weightedEntries)

      if (!winnerEntryId) break

      // Find the winning entry
      const winnerEntry = giveaway.entries.find(e => e.id === winnerEntryId)
      if (!winnerEntry) break

      winners.push({
        entryId: winnerEntryId,
        userId: winnerEntry.user_id,
      })

      selectedEntryIds.add(winnerEntryId)

      // Remove this winner from remaining entries
      remainingEntries = remainingEntries.filter(e => e.id !== winnerEntryId)
    }

    if (winners.length === 0) {
      return NextResponse.json(
        { error: 'Failed to select winners' },
        { status: 500 }
      )
    }

    // Create winner records
    const createdWinners = []
    for (const winner of winners) {
      const winnerRecord = await db.giveawayWinner.create({
        data: {
          giveaway_id: giveawayId,
          entry_id: winner.entryId,
        },
        include: {
          entry: {
            include: {
              user: {
                select: {
                  username: true,
                  kick_user_id: true,
                  profile_picture_url: true,
                },
              },
            },
          },
        },
      })
      createdWinners.push(winnerRecord)
    }

    // Update giveaway status to completed
    await db.giveaway.update({
      where: { id: giveawayId },
      data: { status: 'completed' },
    })

    return NextResponse.json({
      winners: createdWinners.map(w => ({
        ...w,
        id: w.id.toString(),
        giveaway_id: w.giveaway_id.toString(),
        entry_id: w.entry_id.toString(),
        segment_id: w.segment_id?.toString() || null,
      })),
    })
  } catch (error) {
    console.error('Error spinning giveaway:', error)
    return NextResponse.json(
      { error: 'Failed to spin giveaway', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
