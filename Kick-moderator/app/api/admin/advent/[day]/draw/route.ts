import { getAuthenticatedUser, isAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: { day: string } }
) {
  try {
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

    const day = parseInt(params.day)
    if (isNaN(day) || day < 1 || day > 31) {
      return NextResponse.json(
        { error: 'Invalid day. Must be between 1 and 31' },
        { status: 400 }
      )
    }

    // Upsert the day status - mark as drawn
    const dayStatus = await db.adventDayStatus.upsert({
      where: { day },
      update: {
        drawn: true,
        drawn_at: new Date(),
        drawn_by: auth.userId,
        updated_at: new Date(),
      },
      create: {
        day,
        drawn: true,
        drawn_at: new Date(),
        drawn_by: auth.userId,
      },
    })

    return NextResponse.json({
      success: true,
      day: dayStatus.day,
      drawn: dayStatus.drawn,
      drawn_at: dayStatus.drawn_at,
    })
  } catch (error) {
    console.error('Error marking day as drawn:', error)
    return NextResponse.json(
      { error: 'Failed to mark day as drawn', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { day: string } }
) {
  try {
    const adminCheck = await isAdmin(request)
    if (!adminCheck) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 403 }
      )
    }

    const day = parseInt(params.day)
    if (isNaN(day) || day < 1 || day > 31) {
      return NextResponse.json(
        { error: 'Invalid day. Must be between 1 and 31' },
        { status: 400 }
      )
    }

    // Reset the day status - mark as not drawn
    const dayStatus = await db.adventDayStatus.upsert({
      where: { day },
      update: {
        drawn: false,
        drawn_at: null,
        drawn_by: null,
        updated_at: new Date(),
      },
      create: {
        day,
        drawn: false,
      },
    })

    return NextResponse.json({
      success: true,
      day: dayStatus.day,
      drawn: dayStatus.drawn,
    })
  } catch (error) {
    console.error('Error resetting day status:', error)
    return NextResponse.json(
      { error: 'Failed to reset day status', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
