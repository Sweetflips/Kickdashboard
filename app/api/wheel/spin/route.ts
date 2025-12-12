import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  buildCustomSnapshot,
  buildRaffleSnapshot,
  computeWinnerFromRanges,
  pickTargetIndex,
  WHEEL_OVERLAY_KEY,
} from '@/lib/wheel-overlay'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const adminCheck = await isAdmin(request)
    if (!adminCheck) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 })
    }

    const state = await db.wheelOverlayState.upsert({
      where: { key: WHEEL_OVERLAY_KEY },
      update: {},
      create: { key: WHEEL_OVERLAY_KEY },
    })

    // Pick snapshot (locked if present)
    let snapshot: { mode: string; raffle_id: string | null; entries: any[]; totalTickets: number }
    if (state.locked && state.locked_entries && typeof state.locked_total_tickets === 'number') {
      snapshot = {
        mode: state.mode,
        raffle_id: state.raffle_id ? state.raffle_id.toString() : null,
        entries: state.locked_entries as any,
        totalTickets: state.locked_total_tickets,
      }
    } else if (state.mode === 'raffle') {
      if (!state.raffle_id) return NextResponse.json({ error: 'No raffle selected' }, { status: 400 })
      snapshot = await buildRaffleSnapshot(state.raffle_id)
    } else {
      snapshot = await buildCustomSnapshot()
    }

    if (!snapshot.totalTickets || snapshot.totalTickets <= 0 || snapshot.entries.length === 0) {
      return NextResponse.json({ error: 'No entrants to spin' }, { status: 400 })
    }

    const targetIndex = pickTargetIndex(snapshot.totalTickets)
    const winner = computeWinnerFromRanges(snapshot.entries as any, targetIndex)

    if (!winner) {
      return NextResponse.json({ error: 'Failed to determine winner' }, { status: 500 })
    }

    const latest = await db.wheelOverlaySpin.findFirst({
      where: { overlay_key: WHEEL_OVERLAY_KEY },
      orderBy: [{ version: 'desc' }, { created_at: 'desc' }],
      select: { version: true },
    })

    const newVersion = (latest?.version ?? 0) + 1

    const created = await db.wheelOverlaySpin.create({
      data: {
        overlay_key: WHEEL_OVERLAY_KEY,
        version: newVersion,
        mode: snapshot.mode,
        raffle_id: snapshot.raffle_id ? BigInt(snapshot.raffle_id) : null,
        target_ticket_index: targetIndex,
        winner_label: winner.username,
        winner_user_id: snapshot.mode === 'raffle' ? winner.userId : null,
        winner_entry_id: snapshot.mode === 'raffle' ? winner.entryId : null,
      },
    })

    return NextResponse.json({
      success: true,
      spin: {
        id: created.id.toString(),
        version: created.version,
        mode: created.mode,
        raffle_id: created.raffle_id ? created.raffle_id.toString() : null,
        target_ticket_index: created.target_ticket_index,
        winner_label: created.winner_label,
        winner_user_id: created.winner_user_id ? created.winner_user_id.toString() : null,
        winner_entry_id: created.winner_entry_id ? created.winner_entry_id.toString() : null,
        created_at: created.created_at.toISOString(),
      },
      snapshot: {
        totalTickets: snapshot.totalTickets,
        entrants: snapshot.entries.length,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

