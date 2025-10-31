import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthenticatedUser } from '@/lib/auth'

export async function GET(
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
          orderBy: {
            created_at: 'desc',
          },
        },
        winners: {
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
            segment: {
              select: {
                label: true,
                color: true,
              },
            },
          },
        },
      },
    })

    if (!giveaway) {
      return NextResponse.json(
        { error: 'Giveaway not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      giveaway: {
        ...giveaway,
        id: giveaway.id.toString(),
        broadcaster_user_id: giveaway.broadcaster_user_id.toString(),
        entries: giveaway.entries.map(e => ({
          ...e,
          id: e.id.toString(),
          giveaway_id: e.giveaway_id.toString(),
          user_id: e.user_id.toString(),
        })),
        winners: giveaway.winners.map(w => ({
          ...w,
          id: w.id.toString(),
          giveaway_id: w.giveaway_id.toString(),
          entry_id: w.entry_id.toString(),
          segment_id: w.segment_id?.toString() || null,
        })),
      },
    })
  } catch (error) {
    console.error('Error fetching giveaway:', error)
    return NextResponse.json(
      { error: 'Failed to fetch giveaway', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function PUT(
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

    // Verify ownership
    const existing = await db.giveaway.findFirst({
      where: {
        id: giveawayId,
        broadcaster_user_id: auth.kickUserId,
      },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Giveaway not found' },
        { status: 404 }
      )
    }

    // Can't edit active or completed giveaways
    if (existing.status === 'active' || existing.status === 'completed') {
      return NextResponse.json(
        { error: 'Cannot edit active or completed giveaways' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { prize_amount, number_of_winners, entry_min_points } = body

    // Update giveaway
    const updateData: any = {}
    if (prize_amount !== undefined) updateData.prize_amount = prize_amount
    if (number_of_winners !== undefined) updateData.number_of_winners = number_of_winners
    if (entry_min_points !== undefined) updateData.entry_min_points = entry_min_points

    const giveaway = await db.giveaway.update({
      where: { id: giveawayId },
      data: updateData,
    })

    return NextResponse.json({
      giveaway: {
        ...giveaway,
        id: giveaway.id.toString(),
        broadcaster_user_id: giveaway.broadcaster_user_id.toString(),
      },
    })
  } catch (error) {
    console.error('Error updating giveaway:', error)
    return NextResponse.json(
      { error: 'Failed to update giveaway', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
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

    // Verify ownership
    const existing = await db.giveaway.findFirst({
      where: {
        id: giveawayId,
        broadcaster_user_id: auth.kickUserId,
      },
    })

    if (!existing) {
      return NextResponse.json(
        { error: 'Giveaway not found' },
        { status: 404 }
      )
    }

    // Can't delete active giveaways (must cancel first)
    if (existing.status === 'active') {
      return NextResponse.json(
        { error: 'Cannot delete active giveaway. Cancel it first.' },
        { status: 400 }
      )
    }

    await db.giveaway.delete({
      where: { id: giveawayId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting giveaway:', error)
    return NextResponse.json(
      { error: 'Failed to delete giveaway', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
