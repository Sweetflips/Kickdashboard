import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdmin } from '@/lib/auth'
import { rewriteApiMediaUrlToCdn } from '@/lib/media-url'

export const dynamic = 'force-dynamic'

async function getClaimedAchievementCounts(userIds: bigint[]): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map()

  const rows = await db.sweetCoinHistory.groupBy({
    by: ['user_id'],
    where: {
      user_id: { in: userIds },
      message_id: { startsWith: 'achievement:' },
    },
    _count: { _all: true },
  })

  return new Map((rows as Array<{ user_id: bigint; _count: { _all: number } }>).map((r) => [r.user_id.toString(), r._count._all]))
}

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

    // Get users with session diagnostics
    // We'll sort by Sweet Coins in JavaScript since Prisma relation ordering is unreliable with optional relations
    const [usersRaw, total] = await Promise.all([
      db.user.findMany({
        where,
        include: {
          sweet_coins: {
            select: {
              total_sweet_coins: true,
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
      }),
      db.user.count({ where }),
    ])

    // Sort by Sweet Coins descending, then by created_at descending
    const sortedUsers = usersRaw.sort((a, b) => {
      const coinsA = a.sweet_coins?.total_sweet_coins || 0
      const coinsB = b.sweet_coins?.total_sweet_coins || 0
      if (coinsB !== coinsA) return coinsB - coinsA
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

    // Apply pagination after sorting
    const users = sortedUsers.slice(offset, offset + limit)

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

    const sessionStatsMap = new Map((sessionStats as Array<{ user_id: bigint; _count: { id: number } }>).map(s => [s.user_id.toString(), s._count.id]))

    // Duplicate detection: Find users sharing IP addresses
    const userIdsForDuplicates = users.map(u => u.id)
    const userSignupIPs = users.filter(u => u.signup_ip_address).map(u => ({
      id: u.id,
      signup_ip: u.signup_ip_address,
    }))

    // Group users by signup IP
    const signupIPMap = new Map<string, bigint[]>()
    userSignupIPs.forEach(({ id, signup_ip }) => {
      if (signup_ip) {
        if (!signupIPMap.has(signup_ip)) {
          signupIPMap.set(signup_ip, [])
        }
        signupIPMap.get(signup_ip)!.push(id)
      }
    })

    // Get all IP hashes from sessions for these users
    const allSessions = await db.userSession.findMany({
      where: {
        user_id: { in: userIdsForDuplicates },
        ip_hash: { not: null },
      },
      select: {
        user_id: true,
        ip_hash: true,
      },
    })

    // Group users by session IP hash
    const sessionIPMap = new Map<string, bigint[]>()
    allSessions.forEach(session => {
      if (session.ip_hash) {
        if (!sessionIPMap.has(session.ip_hash)) {
          sessionIPMap.set(session.ip_hash, [])
        }
        sessionIPMap.get(session.ip_hash)!.push(session.user_id)
      }
    })

    // Build duplicate flags for each user
    const duplicateFlagsMap = new Map<string, Array<{ user_id: string; username: string; reason: string }>>()

    users.forEach(u => {
      const flags: Array<{ user_id: string; username: string; reason: string }> = []

      // Check signup IP matches
      if (u.signup_ip_address) {
        const signupIPMatches = signupIPMap.get(u.signup_ip_address) || []
        signupIPMatches.forEach(matchId => {
          if (matchId.toString() !== u.id.toString()) {
            const matchedUser = users.find(usr => usr.id.toString() === matchId.toString())
            if (matchedUser) {
              flags.push({
                user_id: matchedUser.id.toString(),
                username: matchedUser.username,
                reason: 'Same signup IP',
              })
            }
          }
        })
      }

      // Check session IP hash matches
      const userSessions = u.user_sessions || []
      const userIPHashes = new Set(userSessions.map(s => s.ip_hash).filter(Boolean))
      userIPHashes.forEach(ipHash => {
        if (ipHash) {
          const sessionIPMatches = sessionIPMap.get(ipHash) || []
          sessionIPMatches.forEach(matchId => {
            if (matchId.toString() !== u.id.toString()) {
              const matchedUser = users.find(usr => usr.id.toString() === matchId.toString())
              if (matchedUser && !flags.some(f => f.user_id === matchedUser.id.toString())) {
                flags.push({
                  user_id: matchedUser.id.toString(),
                  username: matchedUser.username,
                  reason: 'Shared session IP',
                })
              }
            }
          })
        }
      })

      if (flags.length > 0) {
        duplicateFlagsMap.set(u.id.toString(), flags)
      }
    })

    // Claimed achievements count (fast, batched) for admin list display
    const claimedAchievementCounts = await getClaimedAchievementCounts(userIds)

    return NextResponse.json({
      users: users.map((u) => {
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
          profile_picture_url: rewriteApiMediaUrlToCdn(u.custom_profile_picture_url || u.profile_picture_url),
          is_admin: u.is_admin,
          is_excluded: u.is_excluded,
          moderator_override: u.moderator_override,
          // Keep both names for backwards/forwards compatibility:
          // - admin UI expects `total_points`
          // - other parts may use `total_sweet_coins`
          total_points: u.sweet_coins?.total_sweet_coins || 0,
          total_sweet_coins: u.sweet_coins?.total_sweet_coins || 0,
          total_emotes: u.sweet_coins?.total_emotes || 0,
          achievements_unlocked: claimedAchievementCounts.get(u.id.toString()) || 0,
          created_at: u.created_at.toISOString(),
          last_login_at: u.last_login_at?.toISOString() || null,
          // Connected accounts
          kick_connected: u.kick_connected,
          discord_connected: u.discord_connected,
          discord_username: u.discord_username,
          telegram_connected: u.telegram_connected,
          telegram_username: u.telegram_username,
          // IP addresses for admin view
          last_ip_address: u.last_ip_address || null,
          signup_ip_address: u.signup_ip_address || null,
          duplicate_flags: duplicateFlagsMap.get(u.id.toString()) || [],
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
    const { kick_user_id, is_admin, is_excluded, moderator_override } = body

    if (!kick_user_id) {
      return NextResponse.json(
        { error: 'kick_user_id is required' },
        { status: 400 }
      )
    }

    // Build update data object
    const updateData: any = {}
    if (typeof is_admin === 'boolean') {
      updateData.is_admin = is_admin
    }
    if (typeof is_excluded === 'boolean') {
      updateData.is_excluded = is_excluded
    }
    if (moderator_override !== undefined) {
      // Accept null, true, or false
      updateData.moderator_override = moderator_override === null ? null : moderator_override === true
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'At least one field (is_admin, is_excluded, or moderator_override) must be provided' },
        { status: 400 }
      )
    }

    // Update user
    const user = await db.user.update({
      where: { kick_user_id: BigInt(kick_user_id) },
      data: updateData,
      select: {
        id: true,
        kick_user_id: true,
        username: true,
        is_admin: true,
        is_excluded: true,
        moderator_override: true,
      },
    })

    return NextResponse.json({
      user: {
        id: user.id.toString(),
        kick_user_id: user.kick_user_id.toString(),
        username: user.username,
        is_admin: user.is_admin,
        is_excluded: user.is_excluded,
        moderator_override: user.moderator_override,
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
