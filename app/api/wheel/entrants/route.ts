import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { WHEEL_OVERLAY_KEY } from '@/lib/wheel-overlay'

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

    if (state.locked) {
      return NextResponse.json({ error: 'Wheel is locked. Unlock before editing entrants.' }, { status: 400 })
    }

    const body = await request.json()
    const action = body.action as string

    if (action === 'list') {
      // no-op, just return current entrants
    } else if (action === 'add') {
      const label = String(body.label || '').trim()
      const weight = Number(body.weight || 1)
      if (!label) return NextResponse.json({ error: 'label is required' }, { status: 400 })
      if (!Number.isFinite(weight) || weight <= 0) return NextResponse.json({ error: 'weight must be > 0' }, { status: 400 })
      await db.wheelOverlayEntrant.create({
        data: { overlay_key: WHEEL_OVERLAY_KEY, label, weight: Math.floor(weight) },
      })
    } else if (action === 'remove') {
      const id = body.id ? BigInt(body.id) : null
      if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
      await db.wheelOverlayEntrant.delete({ where: { id } })
    } else if (action === 'update') {
      const id = body.id ? BigInt(body.id) : null
      if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
      const data: any = {}
      if (body.label !== undefined) data.label = String(body.label).trim()
      if (body.weight !== undefined) data.weight = Math.floor(Number(body.weight))
      await db.wheelOverlayEntrant.update({ where: { id }, data })
    } else if (action === 'clear') {
      await db.wheelOverlayEntrant.deleteMany({ where: { overlay_key: WHEEL_OVERLAY_KEY } })
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const entrants = await db.wheelOverlayEntrant.findMany({
      where: { overlay_key: WHEEL_OVERLAY_KEY },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    })

    return NextResponse.json({
      success: true,
      entrants: entrants.map((e) => ({
        id: e.id.toString(),
        label: e.label,
        weight: e.weight,
        created_at: e.created_at.toISOString(),
      })),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
