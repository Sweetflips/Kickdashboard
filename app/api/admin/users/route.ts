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

    // Get users with pagination and session diagnostics
    // Order by points descending (highest points first)
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
          user_sessions: {
            take: 10, // Get last 10 sessions for better diagnostics
            orderBy: {
              last_seen_at: 'desc',
            },
            select: {
              session_id: true,
              region: true,
              country: true,
              client_type: true,
              user_agent: true,
              ip_hash: true,
              last_seen_at: true,
              created_at: true,
            },
          },
        },
        orderBy: [
          {
            points: {
              total_points: 'desc',
            },
          },
          {
            created_at: 'desc',
          },
        ],
      }),
      db.user.count({ where }),
    ])

    // Get aggregated session stats for each user
    const userIds = users.map(u => u.id)
    const sessionStats = await db.userSession.groupBy({
      by: ['user_id'],
      where: {
        user_id: { in: userIds },
      },
      _count: {
        id: true,
      },
    })

    const sessionStatsMap = new Map(sessionStats.map(s => [s.user_id.toString(), s._count.id]))

    return NextResponse.json({
      users: users.map(u => {
        const recentSessions = u.user_sessions || []
        const latestSession = recentSessions[0] || null
        const totalSessions = sessionStatsMap.get(u.id.toString()) || 0

        // Get unique regions, countries, and client types
        const uniqueRegions = new Set(recentSessions.map(s => s.region).filter(Boolean))
        const uniqueCountries = new Set(recentSessions.map(s => s.country).filter(Boolean))
        const uniqueClientTypes = new Set(recentSessions.map(s => s.client_type).filter(Boolean))

        return {
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
          // Connected accounts
          kick_connected: u.kick_connected,
          discord_connected: u.discord_connected,
          discord_username: u.discord_username,
          telegram_connected: u.telegram_connected,
          telegram_username: u.telegram_username,
          session_diagnostics: {
            total_sessions: totalSessions,
            last_seen: latestSession?.last_seen_at.toISOString() || null,
            last_region: latestSession?.region || null,
            last_country: latestSession?.country || null,
            last_client_type: latestSession?.client_type || null,
            recent_sessions: recentSessions.map(s => ({
              session_id: s.session_id,
              region: s.region,
              country: s.country,
              client_type: s.client_type,
              user_agent: s.user_agent,
              ip_hash: s.ip_hash,
              last_seen_at: s.last_seen_at.toISOString(),
              created_at: s.created_at.toISOString(),
            })),
            unique_regions: Array.from(uniqueRegions),
            unique_countries: Array.from(uniqueCountries),
            unique_client_types: Array.from(uniqueClientTypes),
          },
        }
      }),
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
