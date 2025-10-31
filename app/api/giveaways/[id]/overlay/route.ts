import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthenticatedUser } from '@/lib/auth'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const giveawayId = BigInt(params.id)

    const giveaway = await db.giveaway.findUnique({
      where: { id: giveawayId },
      include: {
        segments: {
          orderBy: {
            order_index: 'asc',
          },
        },
        entries: {
          select: {
            id: true,
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

    // Calculate total tickets (sum of all points)
    const totalTicketsResult = await db.giveawayEntry.aggregate({
      where: {
        giveaway_id: giveawayId,
      },
      _sum: {
        points_at_entry: true,
      },
    })

    const totalTickets = totalTicketsResult._sum.points_at_entry || 0

    // Return overlay data (no auth required for public overlay)
    return NextResponse.json({
      giveaway: {
        id: giveaway.id.toString(),
        title: giveaway.title,
        description: giveaway.description,
        prize_info: giveaway.prize_info,
        status: giveaway.status,
        entries_count: giveaway.entries.length,
        total_tickets: totalTickets,
        segments: giveaway.segments.map(seg => ({
          id: seg.id.toString(),
          label: seg.label,
          weight: seg.weight,
          color: seg.color,
          order_index: seg.order_index,
        })),
        winner: giveaway.winners.length > 0 ? {
          username: giveaway.winners[0].entry.user.username,
          kick_user_id: giveaway.winners[0].entry.user.kick_user_id.toString(),
          profile_picture_url: giveaway.winners[0].entry.user.profile_picture_url,
          segment: giveaway.winners[0].segment ? {
            label: giveaway.winners[0].segment.label,
            color: giveaway.winners[0].segment.color,
          } : null,
          selected_at: giveaway.winners[0].selected_at.toISOString(),
        } : null,
      },
    })
  } catch (error) {
    console.error('Error fetching overlay data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch overlay data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
