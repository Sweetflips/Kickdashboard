import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthenticatedUser, isAdmin } from '@/lib/auth'
import { selectWeightedWinner, type WeightedEntry } from '@/lib/giveaway'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🎰 [SPIN GIVEAWAY] Received request')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    // Check admin access
    const adminCheck = await isAdmin(request)
    if (!adminCheck) {
      console.error('❌ [AUTH] Admin access required')
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 403 }
      )
    }

    const auth = await getAuthenticatedUser(request)
    if (!auth) {
      console.error('❌ [AUTH] User not authenticated')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const giveawayId = BigInt(params.id)
    console.log(`🎁 [GIVEAWAY] ID: ${giveawayId}`)
    console.log(`👤 [USER] Kick User ID: ${auth.kickUserId}\n`)

    // Verify giveaway exists and user owns it
    console.log(`🔍 [VERIFICATION] Fetching giveaway...`)
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
      console.error(`❌ [VERIFICATION] Giveaway ${giveawayId} not found or doesn't belong to broadcaster ${auth.kickUserId}`)
      
      // Check if giveaway exists at all
      const anyGiveaway = await db.giveaway.findUnique({
        where: { id: giveawayId },
        select: { broadcaster_user_id: true, status: true },
      })
      
      if (anyGiveaway) {
        console.error(`   └─ Giveaway exists but belongs to broadcaster ${anyGiveaway.broadcaster_user_id}, not ${auth.kickUserId}`)
      } else {
        console.error(`   └─ Giveaway ${giveawayId} does not exist`)
      }
      
      return NextResponse.json(
        { error: 'Giveaway not found' },
        { status: 404 }
      )
    }

    console.log(`✅ [VERIFICATION] Giveaway found`)
    console.log(`   ├─ Status: ${giveaway.status}`)
    console.log(`   ├─ Entries: ${giveaway.entries.length}`)
    console.log(`   ├─ Winners: ${giveaway.winners.length}`)
    console.log(`   └─ Required Winners: ${giveaway.number_of_winners}\n`)

    if (giveaway.status !== 'active') {
      console.error(`❌ [VALIDATION] Giveaway status is '${giveaway.status}', must be 'active'`)
      return NextResponse.json(
        { error: `Giveaway must be active to spin. Current status: ${giveaway.status}` },
        { status: 400 }
      )
    }

    if (giveaway.entries.length === 0) {
      console.error(`❌ [VALIDATION] No entries to select from`)
      return NextResponse.json(
        { error: 'No entries to select from' },
        { status: 400 }
      )
    }

    if (giveaway.winners.length > 0) {
      console.error(`❌ [VALIDATION] Winner already selected (${giveaway.winners.length} winner(s))`)
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
      console.error(`❌ [SELECTION] Failed to select winners`)
      return NextResponse.json(
        { error: 'Failed to select winners' },
        { status: 500 }
      )
    }

    console.log(`✅ [SELECTION] Selected ${winners.length} winner(s)`)
    winners.forEach((winner, index) => {
      console.log(`   ${index + 1}. Entry ID: ${winner.entryId}, User ID: ${winner.userId}`)
    })
    console.log()

    // Create winner records
    console.log('💾 [DATABASE] Creating winner records...')
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

    console.log(`✅ [SUCCESS] Giveaway completed`)
    console.log(`   └─ Winners: ${createdWinners.length}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

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
    console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.error('❌ [ERROR] Failed to spin giveaway')
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.error(`   └─ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    if (error instanceof Error && error.stack) {
      console.error(`   └─ Stack: ${error.stack}`)
    }
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
    
    return NextResponse.json(
      { error: 'Failed to spin giveaway', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
