import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthenticatedUser } from '../route'

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

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    const entries = await db.giveawayEntry.findMany({
      where: {
        giveaway_id: giveawayId,
        giveaway: {
          broadcaster_user_id: auth.kickUserId,
        },
      },
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
      take: limit,
      skip: offset,
    })

    const total = await db.giveawayEntry.count({
      where: {
        giveaway_id: giveawayId,
        giveaway: {
          broadcaster_user_id: auth.kickUserId,
        },
      },
    })

    return NextResponse.json({
      entries: entries.map(e => ({
        ...e,
        id: e.id.toString(),
        giveaway_id: e.giveaway_id.toString(),
        user_id: e.user_id.toString(),
      })),
      total,
      limit,
      offset,
    })
  } catch (error) {
    console.error('Error fetching entries:', error)
    return NextResponse.json(
      { error: 'Failed to fetch entries', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

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
    })

    if (!giveaway) {
      return NextResponse.json(
        { error: 'Giveaway not found' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const { kick_user_id } = body

    if (!kick_user_id) {
      return NextResponse.json(
        { error: 'kick_user_id is required' },
        { status: 400 }
      )
    }

    const kickUserId = BigInt(kick_user_id)

    // Find user
    const user = await db.user.findUnique({
      where: { kick_user_id: kickUserId },
      select: { id: true },
    })

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Check if user has minimum points
    const userPoints = await db.userPoints.findUnique({
      where: { user_id: user.id },
    })

    if (!userPoints || userPoints.total_points < giveaway.entry_min_points) {
      return NextResponse.json(
        { error: 'User does not have enough points' },
        { status: 400 }
      )
    }

    // Check if already entered
    const existing = await db.giveawayEntry.findUnique({
      where: {
        giveaway_id_user_id: {
          giveaway_id: giveawayId,
          user_id: user.id,
        },
      },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'User already entered' },
        { status: 400 }
      )
    }

    // Create entry
    const entry = await db.giveawayEntry.create({
      data: {
        giveaway_id: giveawayId,
        user_id: user.id,
        points_at_entry: userPoints.total_points,
      },
      include: {
        user: {
          select: {
            username: true,
            kick_user_id: true,
            profile_picture_url: true,
          },
        },
      },
    })

    return NextResponse.json({
      entry: {
        ...entry,
        id: entry.id.toString(),
        giveaway_id: entry.giveaway_id.toString(),
        user_id: entry.user_id.toString(),
      },
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating entry:', error)
    return NextResponse.json(
      { error: 'Failed to create entry', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
