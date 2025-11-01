import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthenticatedUser, isAdmin } from '@/lib/auth'

const KICK_API_BASE = 'https://api.kick.com/public/v1'

export async function GET(request: Request) {
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

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    const where: any = {
      broadcaster_user_id: auth.kickUserId,
    }

    if (status) {
      where.status = status
    }

    const giveaways = await db.giveaway.findMany({
      where,
      include: {
        segments: {
          orderBy: {
            order_index: 'asc',
          },
        },
        entries: {
          select: {
            id: true,
            points_at_entry: true,
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
      orderBy: {
        created_at: 'desc',
      },
    })

    return NextResponse.json({
      giveaways: giveaways.map(g => {
        // Calculate total tickets for this giveaway
        const totalTickets = g.entries.reduce((sum, entry) => sum + entry.points_at_entry, 0)

        return {
          ...g,
          id: g.id.toString(),
          broadcaster_user_id: g.broadcaster_user_id.toString(),
          stream_session_id: g.stream_session_id?.toString() || null,
          entries_count: g.entries.length,
          total_tickets: totalTickets,
          winners_count: g.winners.length,
          entries: undefined,
        }
      }),
    })
  } catch (error) {
    console.error('Error fetching giveaways:', error)
    return NextResponse.json(
      { error: 'Failed to fetch giveaways', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
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

    const body = await request.json()
    const { prize_amount, number_of_winners, entry_min_points, stream_session_id } = body

    if (!stream_session_id) {
      return NextResponse.json(
        { error: 'stream_session_id is required' },
        { status: 400 }
      )
    }

    if (!prize_amount) {
      return NextResponse.json(
        { error: 'prize_amount is required' },
        { status: 400 }
      )
    }

    // Verify stream session exists and belongs to broadcaster
    const streamSession = await db.streamSession.findFirst({
      where: {
        id: BigInt(stream_session_id),
        broadcaster_user_id: auth.kickUserId,
      },
    })

    if (!streamSession) {
      return NextResponse.json(
        { error: 'Stream session not found or does not belong to you' },
        { status: 404 }
      )
    }

    // Create giveaway (no segments needed - simplified)
    const giveaway = await db.giveaway.create({
      data: {
        broadcaster_user_id: auth.kickUserId,
        stream_session_id: BigInt(stream_session_id),
        title: `Giveaway - ${prize_amount}`, // Auto-generate title
        prize_amount,
        number_of_winners: number_of_winners || 1,
        entry_min_points: entry_min_points || 0,
        status: 'draft',
      },
    })

    return NextResponse.json({
      giveaway: {
        ...giveaway,
        id: giveaway.id.toString(),
        broadcaster_user_id: giveaway.broadcaster_user_id.toString(),
        stream_session_id: giveaway.stream_session_id?.toString() || null,
      },
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating giveaway:', error)
    return NextResponse.json(
      { error: 'Failed to create giveaway', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
