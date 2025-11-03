import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthenticatedUser, isAdmin } from '@/lib/auth'
import { getEligibleUsers } from '@/lib/giveaway'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Check admin access
    const adminCheck = await isAdmin(request)
    if (!adminCheck) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 403 }
      )
    }

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
    })

    if (!giveaway) {
      return NextResponse.json(
        { error: 'Giveaway not found' },
        { status: 404 }
      )
    }

    if (giveaway.status !== 'draft') {
      return NextResponse.json(
        { error: 'Giveaway must be in draft status to activate' },
        { status: 400 }
      )
    }

    // Get all eligible users based on stream session points
    const eligibleUsers = await getEligibleUsers(
      auth.kickUserId,
      giveaway.entry_min_points,
      giveaway.stream_session_id
    )

    // Create entries for all eligible users
    const entriesCreated = []
    for (const eligible of eligibleUsers) {
      try {
        // Verify user still exists in database before creating entry
        const userExists = await db.user.findUnique({
          where: { id: eligible.userId },
          select: { id: true },
        })

        if (!userExists) {
          console.warn(`⚠️ User ${eligible.userId} (Kick: ${eligible.kickUserId}) no longer exists, skipping entry creation`)
          continue
        }

        // Check if already entered
        const existing = await db.giveawayEntry.findUnique({
          where: {
            giveaway_id_user_id: {
              giveaway_id: giveawayId,
              user_id: eligible.userId,
            },
          },
        })

        if (!existing) {
          await db.giveawayEntry.create({
            data: {
              giveaway_id: giveawayId,
              user_id: eligible.userId,
              points_at_entry: eligible.points,
            },
          })
          entriesCreated.push(eligible.kickUserId.toString())
        }
      } catch (error) {
        console.error(`Error creating entry for user ${eligible.kickUserId} (DB ID: ${eligible.userId}):`, error)
      }
    }

    // Update giveaway status to active
    await db.giveaway.update({
      where: { id: giveawayId },
      data: { status: 'active' },
    })

    return NextResponse.json({
      success: true,
      entries_created: entriesCreated.length,
      total_eligible: eligibleUsers.length,
    })
  } catch (error) {
    console.error('Error activating giveaway:', error)
    return NextResponse.json(
      { error: 'Failed to activate giveaway', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
