"use client"

import RaffleWheel from '@/components/RaffleWheel'
import { useEffect, useState } from 'react'

export default function PublicWheelPage({ params }: { params: { id: string } }) {
    const [raffle, setRaffle] = useState<any>(null)
    const [entries, setEntries] = useState<any[]>([])
    const [winner, setWinner] = useState<any | null>(null)

    useEffect(() => {
        async function load() {
            const [rResp, eResp, wResp] = await Promise.all([
                fetch(`/api/raffles/${params.id}`),
                fetch(`/api/raffles/${params.id}/entries`),
                fetch(`/api/raffles/${params.id}/winners`),
            ])
            if (rResp.ok) setRaffle(await rResp.json())
            if (eResp.ok) {
                const ed = await eResp.json()
                setEntries(ed.entries || [])
            }
            if (wResp.ok) {
                const wd = await wResp.json()
                if (wd.winners && wd.winners.length > 0) {
                    setWinner(wd.winners[0])
                }
            }
        }
        load()
    }, [params.id])

    const handleSpin = () => {
        // Public only animates to last drawn winner if available
        if (!winner) return
        // The RaffleWheel component will animate to targetIndex when prop changes.
        // We can re-render the wheel by setting a local state if needed; simpler: nothing needed - RaffleWheel will animate on mount when targetIndex set.
    }

    return (
        <div className="p-8">
            <h1 className="text-2xl font-bold">{raffle?.raffle?.title || 'Raffle'}</h1>
            <p className="text-sm text-gray-500">{raffle?.raffle?.prize_description}</p>
            <div className="mt-6 flex flex-col items-center gap-4">
                <RaffleWheel entries={entries} totalTickets={entries?.length > 0 ? entries[entries.length - 1].range_end : 0} targetIndex={winner?.selected_ticket_index ?? null} backgroundImageUrl={raffle?.raffle?.wheel_background_url || null} centerLogoUrl={raffle?.raffle?.center_logo_url || null} sliceOpacity={Number(raffle?.raffle?.slice_opacity || 0.5)} />
                <button onClick={handleSpin} className="px-4 py-2 bg-blue-600 text-white rounded">Spin</button>
                {winner && (
                    <div className="mt-2 text-center">
                        <p className="font-semibold">Result: {winner.username}</p>
                    </div>
                )}
            </div>
        </div>
    )
}
