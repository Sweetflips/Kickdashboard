import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

const KICK_API_BASE = 'https://api.kick.com/public/v1'

export async function getAuthenticatedUser(request: Request): Promise<{ kickUserId: bigint; userId: bigint } | null> {
  try {
    // Try Authorization header first
    const authHeader = request.headers.get('authorization')
    let accessToken = authHeader?.replace('Bearer ', '')

    // Fallback to query param
    if (!accessToken) {
      const { searchParams } = new URL(request.url)
      accessToken = searchParams.get('access_token') || undefined
    }

    if (!accessToken) {
      return null
    }

    // Fetch user from Kick API
    const response = await fetch(`${KICK_API_BASE}/users`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      return null
    }

    const apiResponse = await response.json()
    const userDataArray = apiResponse.data || []

    if (!Array.isArray(userDataArray) || userDataArray.length === 0) {
      return null
    }

    const userData = userDataArray[0]
    const kickUserId = BigInt(userData.user_id)

    // Find user in database
    const user = await db.user.findUnique({
      where: { kick_user_id: kickUserId },
      select: { id: true },
    })

    if (!user) {
      return null
    }

    return {
      kickUserId,
      userId: user.id,
    }
  } catch (error) {
    console.error('Error authenticating user:', error)
    return null
  }
}

export async function GET(request: Request) {
  try {
    const auth = await getAuthenticatedUser(request)
    if (!auth) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

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
    const auth = await getAuthenticatedUser(request)
    if (!auth) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

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
