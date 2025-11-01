import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdmin, getAuthenticatedUser } from '@/lib/auth'

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

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const search = searchParams.get('search') || ''

    // Build where clause
    const where: any = {}
    if (search) {
      where.OR = [
        { username: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ]
    }

    // Get users with pagination
    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        take: limit,
        skip: offset,
        include: {
          points: {
            select: {
              total_points: true,
              total_emotes: true,
            },
          },
        },
        orderBy: {
          created_at: 'desc',
        },
      }),
      db.user.count({ where }),
    ])

    return NextResponse.json({
      users: users.map(u => ({
        id: u.id.toString(),
        kick_user_id: u.kick_user_id.toString(),
        username: u.username,
        email: u.email,
        profile_picture_url: u.custom_profile_picture_url || u.profile_picture_url,
        is_admin: u.is_admin,
        total_points: u.points?.total_points || 0,
        total_emotes: u.points?.total_emotes || 0,
        created_at: u.created_at.toISOString(),
        last_login_at: u.last_login_at?.toISOString() || null,
      })),
      total,
      limit,
      offset,
    })
  } catch (error) {
    console.error('Error fetching users:', error)
    return NextResponse.json(
      { error: 'Failed to fetch users', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request) {
  try {
    // Check admin access
    const adminCheck = await isAdmin(request)
    if (!adminCheck) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { kick_user_id, is_admin } = body

    if (!kick_user_id) {
      return NextResponse.json(
        { error: 'kick_user_id is required' },
        { status: 400 }
      )
    }

    if (typeof is_admin !== 'boolean') {
      return NextResponse.json(
        { error: 'is_admin must be a boolean' },
        { status: 400 }
      )
    }

    // Update user admin status
    const user = await db.user.update({
      where: { kick_user_id: BigInt(kick_user_id) },
      data: { is_admin },
      select: {
        id: true,
        kick_user_id: true,
        username: true,
        is_admin: true,
      },
    })

    return NextResponse.json({
      user: {
        id: user.id.toString(),
        kick_user_id: user.kick_user_id.toString(),
        username: user.username,
        is_admin: user.is_admin,
      },
    })
  } catch (error) {
    console.error('Error updating user:', error)
    return NextResponse.json(
      { error: 'Failed to update user', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
