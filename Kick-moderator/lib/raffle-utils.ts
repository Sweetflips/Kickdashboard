import crypto from 'crypto'

export interface EntryRange {
    entryId: bigint
    userId: bigint
    username: string
    tickets: number
    rangeStart: number // inclusive
    rangeEnd: number // exclusive
    source?: string
}

/**
 * Build cumulative ranges for entries. Each ticket gets one index in [0..totalTickets-1]
 */
export function buildEntryRanges(entries: Array<{ id: bigint; userId: bigint; username: string; tickets: number; source?: string }>) {
    const ranges: EntryRange[] = []
    let cursor = 0
    for (const e of entries) {
        const start = cursor
        const end = start + e.tickets
        ranges.push({
            entryId: e.id,
            userId: e.userId,
            username: e.username,
            tickets: e.tickets,
            rangeStart: start,
            rangeEnd: end
            ,
            source: e.source
        })
        cursor = end
    }
    return { ranges, totalTickets: cursor }
}

/**
 * Deterministic random integer generator using HMAC-SHA256 over seed + counter
 * Returns a bigint between 0 and maxExclusive - 1
 */
export function deterministicRandomInt(seedHex: string, counter: number, maxExclusive: number): number {
    // Use HMAC with seed as key and counter as message
    const hmac = crypto.createHmac('sha256', seedHex)
    hmac.update(counter.toString())
    const digest = hmac.digest()
    // Take first 8 bytes for a 64-bit integer
    const slice = digest.subarray(0, 8)
    let val = BigInt(0)
    for (let i = 0; i < slice.length; i++) {
        val = (val << BigInt(8)) + BigInt(slice[i])
    }
    const mod = BigInt(maxExclusive)
    const idx = Number(val % mod)
    return idx
}

/** Binary search to find entry range for index (index in [0..totalTickets-1]) */
export function findEntryForIndex(ranges: EntryRange[], index: number) {
    let lo = 0
    let hi = ranges.length - 1
    while (lo <= hi) {
        const mid = (lo + hi) >> 1
        const r = ranges[mid]
        if (index >= r.rangeStart && index < r.rangeEnd) {
            return r
        }
        if (index < r.rangeStart) hi = mid - 1
        else lo = mid + 1
    }
    return null
}

export default {
    buildEntryRanges,
    deterministicRandomInt,
    findEntryForIndex,
}
