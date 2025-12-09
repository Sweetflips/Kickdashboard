import { buildEntryRanges, deterministicRandomInt, findEntryForIndex } from '@/lib/raffle-utils'

async function run() {
    const entries = [
        { id: BigInt(1), userId: BigInt(101), username: 'a', tickets: 3 },
        { id: BigInt(2), userId: BigInt(102), username: 'b', tickets: 5 },
        { id: BigInt(3), userId: BigInt(103), username: 'c', tickets: 2 },
    ]
    const { ranges, totalTickets } = buildEntryRanges(entries as any)
    console.log('Ranges:', ranges, 'totalTickets:', totalTickets)
    const seed = 'deadbeefdeadbeefdeadbeefdeadbeef'
    for (let i = 0; i < 10; i++) {
        const idx = deterministicRandomInt(seed, i, totalTickets)
        const r = findEntryForIndex(ranges, idx)
        console.log('rand', i, idx, '->', r?.username)
    }
}

run().catch(e => {
    console.error('Test failed', e)
    process.exit(1)
})
