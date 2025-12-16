import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  assertValidMode,
  buildCustomSnapshot,
  buildRaffleSnapshot,
  getOrCreateOverlayState,
  WHEEL_OVERLAY_KEY,
} from '@/lib/wheel-overlay'

export const dynamic = 'force-dynamic'

export async function PUT(request: Request) {
  try {
    const adminCheck = await isAdmin(request)
    if (!adminCheck) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const mode = assertValidMode(body.mode)
    const raffleId = body.raffle_id ? BigInt(body.raffle_id) : null

    await getOrCreateOverlayState()

    // If locking, snapshot the current entries/tickets so the overlay is stable.
    const wantsLock = body.locked === true
    const wantsUnlock = body.locked === false

    let locked_entries: any = undefined
    let locked_total_tickets: number | null | undefined = undefined

    if (wantsLock) {
      if (mode === 'raffle') {
        if (!raffleId) {
          return NextResponse.json({ error: 'raffle_id is required for raffle mode' }, { status: 400 })
        }
        const snap = await buildRaffleSnapshot(raffleId)
        locked_entries = snap.entries
        locked_total_tickets = snap.totalTickets
      } else {
        const snap = await buildCustomSnapshot()
        locked_entries = snap.entries
        locked_total_tickets = snap.totalTickets
      }
    }

    const updated = await db.wheelOverlayState.update({
      where: { key: WHEEL_OVERLAY_KEY },
      data: {
        mode,
        raffle_id: mode === 'raffle' ? raffleId : null,
        title: typeof body.title === 'string' ? body.title : undefined,
        wheel_background_url:
          body.wheel_background_url === null ? null : typeof body.wheel_background_url === 'string' ? body.wheel_background_url : undefined,
        center_logo_url:
          body.center_logo_url === null ? null : typeof body.center_logo_url === 'string' ? body.center_logo_url : undefined,
        slice_opacity:
          body.slice_opacity === null
            ? null
            : body.slice_opacity !== undefined
              ? Number(body.slice_opacity)
              : undefined,
        locked: wantsLock ? true : wantsUnlock ? false : undefined,
        locked_entries: wantsLock ? locked_entries : wantsUnlock ? null : undefined,
        locked_total_tickets: wantsLock ? locked_total_tickets : wantsUnlock ? null : undefined,
      },
    })

    return NextResponse.json({
      success: true,
      state: {
        key: updated.key,
        mode: updated.mode,
        raffle_id: updated.raffle_id ? updated.raffle_id.toString() : null,
        title: updated.title || null,
        locked: updated.locked,
        wheel_background_url: updated.wheel_background_url || null,
        center_logo_url: updated.center_logo_url || null,
        slice_opacity: updated.slice_opacity ?? 0.5,
        updated_at: updated.updated_at.toISOString(),
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}









