import { db } from '@/lib/db'
import { buildEntryRanges, findEntryForIndex } from '@/lib/raffle-utils'
import { getOverlayAccessKey } from '@/lib/overlay-access-key'
import crypto from 'crypto'

export const WHEEL_OVERLAY_KEY = 'default'

export type WheelMode = 'raffle' | 'custom'

export type WheelRangeEntry = {
  entry_id: string
  user_id: string
  username: string
  tickets: number
  range_start: number
  range_end: number
  source?: string
}

export type WheelSnapshot = {
  mode: WheelMode
  raffle_id: string | null
  entries: WheelRangeEntry[]
  totalTickets: number
}

export function assertValidMode(mode: any): WheelMode {
  if (mode === 'raffle' || mode === 'custom') return mode
  throw new Error('Invalid mode')
}

export async function requireOverlayKeyFromSearchParams(searchParams: URLSearchParams) {
  const required = await getOverlayAccessKey()
  const key = searchParams.get('key') || ''
  if (key !== required) {
    const err = new Error('Invalid overlay key')
    ;(err as any).status = 403
    throw err
  }
}

export async function getOrCreateOverlayState() {
  return db.wheelOverlayState.upsert({
    where: { key: WHEEL_OVERLAY_KEY },
    update: {},
    create: { key: WHEEL_OVERLAY_KEY },
  })
}

export async function buildRaffleSnapshot(raffleId: bigint): Promise<WheelSnapshot> {
  const entries = await db.raffleEntry.findMany({
    where: { raffle_id: raffleId },
    include: { user: { select: { id: true, username: true } } },
    orderBy: { id: 'asc' },
  })

  const mapped = entries.map((e) => ({
    id: e.id,
    userId: e.user.id,
    username: e.user.username,
    tickets: e.tickets,
    source: e.source || 'system',
  }))

  const { ranges, totalTickets } = buildEntryRanges(mapped)

  return {
    mode: 'raffle',
    raffle_id: raffleId.toString(),
    totalTickets,
    entries: ranges.map((r) => ({
      entry_id: r.entryId.toString(),
      user_id: r.userId.toString(),
      username: r.username,
      tickets: r.tickets,
      range_start: r.rangeStart,
      range_end: r.rangeEnd,
      source: r.source || 'system',
    })),
  }
}

export async function buildCustomSnapshot(): Promise<WheelSnapshot> {
  const entrants = await db.wheelOverlayEntrant.findMany({
    where: { overlay_key: WHEEL_OVERLAY_KEY },
    orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
  })

  const mapped = entrants
    .filter((e) => Number(e.weight) > 0)
    .map((e) => ({
      id: e.id,
      userId: e.id,
      username: e.label,
      tickets: Number(e.weight),
      source: 'custom',
    }))

  const { ranges, totalTickets } = buildEntryRanges(mapped)

  return {
    mode: 'custom',
    raffle_id: null,
    totalTickets,
    entries: ranges.map((r) => ({
      entry_id: r.entryId.toString(),
      user_id: r.userId.toString(),
      username: r.username,
      tickets: r.tickets,
      range_start: r.rangeStart,
      range_end: r.rangeEnd,
      source: r.source || 'custom',
    })),
  }
}

export function pickTargetIndex(totalTickets: number) {
  if (!Number.isFinite(totalTickets) || totalTickets <= 0) {
    throw new Error('No tickets to spin')
  }
  return crypto.randomInt(0, totalTickets)
}

export function computeWinnerFromRanges(entries: WheelRangeEntry[], targetIndex: number) {
  // Convert to internal EntryRange format for binary search
  const internal = entries.map((e) => ({
    entryId: BigInt(e.entry_id),
    userId: BigInt(e.user_id || '0'),
    username: e.username,
    tickets: e.tickets,
    rangeStart: e.range_start,
    rangeEnd: e.range_end,
    source: e.source,
  }))
  const r = findEntryForIndex(internal as any, targetIndex) as any
  if (!r) return null
  return {
    entryId: r.entryId as bigint,
    userId: r.userId as bigint,
    username: r.username as string,
    tickets: r.tickets as number,
    rangeStart: r.rangeStart as number,
    rangeEnd: r.rangeEnd as number,
  }
}

