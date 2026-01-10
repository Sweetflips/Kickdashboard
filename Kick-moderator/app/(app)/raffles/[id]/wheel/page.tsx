"use client"

import RaffleWheel from '@/components/RaffleWheel'
import { useEffect, useState } from 'react'

interface PublicWheelPageProps {
    params: { id: string }
    searchParams?: { [key: string]: string | string[] | undefined }
}

export default function PublicWheelPage({ params, searchParams }: PublicWheelPageProps) {
    const [raffle, setRaffle] = useState<any>(null)
    const [entries, setEntries] = useState<any[]>([])
    const [winner, setWinner] = useState<any | null>(null)
    const [lastWinnerId, setLastWinnerId] = useState<string | null>(null)

    const isOverlay = searchParams?.overlay === '1' || searchParams?.overlay === 'true'

    useEffect(() => {
        async function loadInitial() {
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
                    setLastWinnerId(wd.winners[0].id)
                }
            }
        }
        loadInitial()
    }, [params.id])

    useEffect(() => {
        if (!isOverlay) return

        // Extract key from URL if present
        const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
        const overlayKey = urlParams?.get('key') || ''

        const interval = setInterval(async () => {
            try {
                // Include key in winners fetch if provided
                const winnersUrl = `/api/raffles/${params.id}/winners${overlayKey ? `?key=${encodeURIComponent(overlayKey)}` : ''}`
                const wResp = await fetch(winnersUrl)
                if (!wResp.ok) return
                const wd = await wResp.json()
                if (wd.winners && wd.winners.length > 0) {
                    const newest = wd.winners[0]
                    if (!lastWinnerId || newest.id !== lastWinnerId) {
                        // New winner drawn - refresh entries and update winner
                            const eResp = await fetch(`/api/raffles/${params.id}/entries`)
                            if (eResp.ok) {
                                const ed = await eResp.json()
                                setEntries(ed.entries || [])
                            }
                        setWinner(newest)
                        setLastWinnerId(newest.id)
                    }
                }
            } catch (err) {
                console.error('Error polling winners for overlay:', err)
            }
        }, 1000) // Poll every 1 second for live feel

        return () => clearInterval(interval)
    }, [isOverlay, params.id, lastWinnerId])

    const totalTickets = entries?.length > 0 ? entries[entries.length - 1].range_end : 0
    const targetIndex = winner?.selected_ticket_index ?? null

    if (isOverlay) {
        return (
            <div className="w-screen h-screen flex items-center justify-center bg-transparent">
                <RaffleWheel
                    entries={entries}
                    totalTickets={totalTickets}
                    targetIndex={targetIndex}
                    backgroundImageUrl={raffle?.raffle?.wheel_background_url || null}
                    centerLogoUrl={raffle?.raffle?.center_logo_url || null}
                    sliceOpacity={Number(raffle?.raffle?.slice_opacity || 0.5)}
                />
            </div>
        )
    }

    return (
        <div className="p-8">
            <h1 className="text-2xl font-bold">{raffle?.raffle?.title || 'Raffle'}</h1>
            <p className="text-sm text-gray-500">{raffle?.raffle?.prize_description}</p>
            <div className="mt-6 flex flex-col items-center gap-4">
                <RaffleWheel
                    entries={entries}
                    totalTickets={totalTickets}
                    targetIndex={targetIndex}
                    backgroundImageUrl={raffle?.raffle?.wheel_background_url || null}
                    centerLogoUrl={raffle?.raffle?.center_logo_url || null}
                    sliceOpacity={Number(raffle?.raffle?.slice_opacity || 0.5)}
                />
                {winner && (
                    <div className="mt-2 text-center">
                        <p className="font-semibold">Last result: {winner.username}</p>
                    </div>
                )}
            </div>
        </div>
    )
}
