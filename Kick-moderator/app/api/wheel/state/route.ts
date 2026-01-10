import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdmin } from '@/lib/auth'
import {
    buildCustomSnapshot,
    buildRaffleSnapshot,
    getOrCreateOverlayState,
    requireOverlayKeyFromSearchParams,
    WHEEL_OVERLAY_KEY,
} from '@/lib/wheel-overlay'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    try {
      await requireOverlayKeyFromSearchParams(searchParams)
    } catch (e) {
      // Allow admins to fetch state without the overlay key (so control panel works).
      const adminCheck = await isAdmin(request)
      if (!adminCheck) throw e
    }

    const state = await getOrCreateOverlayState()

    const latestSpin = await db.wheelOverlaySpin.findFirst({
      where: { overlay_key: WHEEL_OVERLAY_KEY },
      orderBy: [{ version: 'desc' }, { created_at: 'desc' }],
    })

    // Choose snapshot source: locked snapshot if present, otherwise live
    let snapshot: any = null
    if (state.locked && state.locked_entries && typeof state.locked_total_tickets === 'number') {
      snapshot = {
        mode: state.mode,
        raffle_id: state.raffle_id ? state.raffle_id.toString() : null,
        entries: state.locked_entries,
        totalTickets: state.locked_total_tickets,
      }
    } else if (state.mode === 'raffle') {
      if (!state.raffle_id) {
        snapshot = { mode: 'raffle', raffle_id: null, entries: [], totalTickets: 0 }
      } else {
        snapshot = await buildRaffleSnapshot(state.raffle_id)
      }
    } else {
      snapshot = await buildCustomSnapshot()
    }

    return NextResponse.json({
      success: true,
      state: {
        key: state.key,
        mode: state.mode,
        raffle_id: state.raffle_id ? state.raffle_id.toString() : null,
        title: state.title || null,
        locked: state.locked,
        wheel_background_url: state.wheel_background_url || null,
        center_logo_url: state.center_logo_url || null,
        slice_opacity: state.slice_opacity ?? 0.5,
        updated_at: state.updated_at.toISOString(),
      },
      snapshot,
      spin: latestSpin
        ? {
            id: latestSpin.id.toString(),
            version: latestSpin.version,
            mode: latestSpin.mode,
            raffle_id: latestSpin.raffle_id ? latestSpin.raffle_id.toString() : null,
            target_ticket_index: latestSpin.target_ticket_index,
            winner_label: latestSpin.winner_label,
            winner_user_id: latestSpin.winner_user_id ? latestSpin.winner_user_id.toString() : null,
            winner_entry_id: latestSpin.winner_entry_id ? latestSpin.winner_entry_id.toString() : null,
            created_at: latestSpin.created_at.toISOString(),
          }
        : null,
    })
  } catch (err) {
    const status = typeof (err as any)?.status === 'number' ? (err as any).status : 500
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status })
  }
}
