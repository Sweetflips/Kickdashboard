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
          segments: g.segments.map(s => ({
            ...s,
            id: s.id.toString(),
            giveaway_id: s.giveaway_id.toString(),
          })),
          winners: g.winners.map(w => ({
            ...w,
            id: w.id.toString(),
            giveaway_id: w.giveaway_id.toString(),
            entry_id: w.entry_id.toString(),
            segment_id: w.segment_id?.toString() || null,
            entry: {
              ...w.entry,
              id: w.entry.id.toString(),
              giveaway_id: w.entry.giveaway_id.toString(),
              user_id: w.entry.user_id.toString(),
              user: {
                ...w.entry.user,
                kick_user_id: w.entry.user.kick_user_id.toString(),
              },
            },
          })),
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
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🎁 [CREATE GIVEAWAY] Received request')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    // Check admin access
    const adminCheck = await isAdmin(request)
    if (!adminCheck) {
      console.error('❌ [AUTH] Admin access required')
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 403 }
      )
    }

    const auth = await getAuthenticatedUser(request)
    if (!auth) {
      console.error('❌ [AUTH] User not authenticated')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log(`👤 [USER] Kick User ID: ${auth.kickUserId}`)

    const body = await request.json()
    const { prize_amount, number_of_winners, entry_min_points, stream_session_id } = body

    console.log('📥 [PARAMS] Received parameters:')
    console.log(`   ├─ prize_amount: ${prize_amount || 'N/A'}`)
    console.log(`   ├─ number_of_winners: ${number_of_winners || 'N/A'}`)
    console.log(`   ├─ entry_min_points: ${entry_min_points || 'N/A'}`)
    console.log(`   └─ stream_session_id: ${stream_session_id || 'N/A'}\n`)

    if (!stream_session_id) {
      console.error('❌ [VALIDATION] stream_session_id is required')
      return NextResponse.json(
        { error: 'stream_session_id is required' },
        { status: 400 }
      )
    }

    if (!prize_amount) {
      console.error('❌ [VALIDATION] prize_amount is required')
      return NextResponse.json(
        { error: 'prize_amount is required' },
        { status: 400 }
      )
    }

    // Verify stream session exists and belongs to broadcaster
    console.log(`🔍 [VERIFICATION] Checking stream session ${stream_session_id}...`)
    const streamSession = await db.streamSession.findFirst({
      where: {
        id: BigInt(stream_session_id),
        broadcaster_user_id: auth.kickUserId,
      },
    })

    if (!streamSession) {
      console.error(`❌ [VERIFICATION] Stream session ${stream_session_id} not found or doesn't belong to broadcaster ${auth.kickUserId}`)
      
      // Check if stream session exists at all
      const anySession = await db.streamSession.findUnique({
        where: { id: BigInt(stream_session_id) },
        select: { broadcaster_user_id: true },
      })
      
      if (anySession) {
        console.error(`   └─ Stream session exists but belongs to broadcaster ${anySession.broadcaster_user_id}, not ${auth.kickUserId}`)
      } else {
        console.error(`   └─ Stream session ${stream_session_id} does not exist`)
      }
      
      return NextResponse.json(
        { error: 'Stream session not found or does not belong to you' },
        { status: 404 }
      )
    }

    console.log(`✅ [VERIFICATION] Stream session found`)
    console.log(`   ├─ Session ID: ${streamSession.id}`)
    console.log(`   ├─ Channel: ${streamSession.channel_slug}`)
    console.log(`   └─ Title: ${streamSession.session_title || 'N/A'}\n`)

    // Create giveaway (no segments needed - simplified)
    console.log('💾 [DATABASE] Creating giveaway...')
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

    console.log(`✅ [SUCCESS] Giveaway created`)
    console.log(`   ├─ Giveaway ID: ${giveaway.id}`)
    console.log(`   ├─ Title: ${giveaway.title}`)
    console.log(`   ├─ Prize: ${giveaway.prize_amount}`)
    console.log(`   └─ Winners: ${giveaway.number_of_winners}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    return NextResponse.json({
      giveaway: {
        ...giveaway,
        id: giveaway.id.toString(),
        broadcaster_user_id: giveaway.broadcaster_user_id.toString(),
        stream_session_id: giveaway.stream_session_id?.toString() || null,
      },
    }, { status: 201 })
  } catch (error) {
    console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.error('❌ [ERROR] Failed to create giveaway')
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.error(`   └─ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    if (error instanceof Error && error.stack) {
      console.error(`   └─ Stack: ${error.stack}`)
    }
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
    
    return NextResponse.json(
      { error: 'Failed to create giveaway', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
