"use client"

import { useEffect, useRef } from 'react'

interface Entry {
    entry_id: string
    user_id: string
    username: string
    tickets: number
    range_start: number
    range_end: number
    source?: string
}

interface RaffleWheelProps {
    entries: Entry[]
    totalTickets: number
    onSpinComplete?: (winner: Entry) => void
    targetIndex?: number | null // if provided, wheel will animate to land on this index
    backgroundImageUrl?: string | null
    sliceOpacity?: number
    centerLogoUrl?: string | null
    maskNames?: boolean
}

export default function RaffleWheel({
    entries,
    totalTickets,
    onSpinComplete,
    targetIndex,
    backgroundImageUrl,
    sliceOpacity = 0.5,
    centerLogoUrl,
    maskNames = true,
}: RaffleWheelProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const winwheelRef = useRef<any>(null)

    useEffect(() => {
        // Load Winwheel script and TweenLite via CDN if not already loaded
        const loadScript = (src: string) => new Promise((resolve, reject) => {
            if (document.querySelector(`script[src=\"${src}\"]`)) return resolve(true)
            const s = document.createElement('script')
            s.src = src
            s.async = true
            s.onload = () => resolve(true)
            s.onerror = reject
            document.head.appendChild(s)
        })

        const bootstrap = async () => {
            try {
                // TweenLite (GSAP) and Winwheel CDN
                await loadScript('https://cdn.jsdelivr.net/npm/gsap@3.12.2/dist/gsap.min.js')
                await loadScript('https://cdnjs.cloudflare.com/ajax/libs/Winwheel.js/2.7.0/Winwheel.min.js')
                const Winwheel = (window as any).Winwheel

                // Build segments: if too many tickets, aggregate per user, otherwise one segment per ticket
                let segmentArray: any[] = []
                if (totalTickets <= 2000) {
                    // Build a separate segment per ticket
                    for (const e of entries) {
                        const color = rgbaFromString(e.username || e.user_id || e.entry_id, sliceOpacity)
                        for (let i = e.range_start; i < e.range_end; i++) {
                            segmentArray.push({ fillStyle: color, text: formatName(e.username, maskNames) })
                        }
                    }
                } else {
                    // Fall back: one segment per user, sized proportional to tickets
                    for (const e of entries) {
                        const color = rgbaFromString(e.username || e.user_id || e.entry_id, sliceOpacity)
                        segmentArray.push({
                            fillStyle: color,
                            text: `${formatName(e.username, maskNames)} (${e.tickets})`,
                            size: (e.tickets / totalTickets) * 360
                        })
                    }
                }

                // instantiate Winwheel
                winwheelRef.current = new Winwheel({
                    canvasId: 'raffleWheelCanvas',
                    numSegments: segmentArray.length,
                    outerRadius: 260,
                    innerRadius: 60,
                    segments: segmentArray,
                    animation: {
                        type: 'spinToStop',
                        duration: 5,
                        spins: 6,
                        callbackFinished: (w: any) => {
                            // Find winner segment index
                            const seg = w.getIndicatedSegment()
                            // seg.text contains the masked name; we need to map to original
                            const idx = w.getIndicatedSegmentNumber() - 1
                            let winnerEntry: any = null
                            if (totalTickets <= 2000) {
                                // map index to ticket index
                                const ticketIndex = idx
                                // find which entry ranges include ticketIndex
                                for (const e of entries) {
                                    if (ticketIndex >= e.range_start && ticketIndex < e.range_end) {
                                        winnerEntry = e
                                        break
                                    }
                                }
                            } else {
                                // aggregated mode: find the user segment by idx
                                winnerEntry = entries[idx]
                            }

                            if (onSpinComplete && winnerEntry) onSpinComplete(winnerEntry)
                        }
                    }
                })

                // If a target index provided, compute stopAngle and start animation
                if (typeof targetIndex === 'number' && targetIndex >= 0) {
                    // compute angle based on ticket index (works for both per-ticket and aggregated modes)
                    let midAngle = 0
                    const anglePerTicket = 360 / totalTickets
                    if (totalTickets <= 2000) {
                        midAngle = (targetIndex + 0.5) * anglePerTicket
                    } else {
                        // Find entry that contains the target ticket index and land in the middle of its arc
                        const found = entries.find(e => targetIndex >= e.range_start && targetIndex < e.range_end)
                        if (found) {
                            const start = (found.range_start / totalTickets) * 360
                            const end = (found.range_end / totalTickets) * 360
                            midAngle = (start + end) / 2
                        } else {
                            midAngle = (targetIndex + 0.5) * anglePerTicket
                        }
                    }
                    const stopAngle = 360 - midAngle
                    // set stopAngle and start
                    winwheelRef.current.animation.stopAngle = stopAngle
                    winwheelRef.current.startAnimation()
                }
            } catch (err) {
                console.error('Failed to load winwheel:', err)
            }
        }

        bootstrap()
        return () => {
            // Clean up any running animation and instance when dependencies change or component unmounts
            if (winwheelRef.current) {
                try {
                    winwheelRef.current.stopAnimation(false)
                } catch {
                    // ignore
                }
                winwheelRef.current = null
            }
        }
    }, [entries, totalTickets, targetIndex, onSpinComplete, sliceOpacity, maskNames])

    return (
        <div className="relative" style={{ width: 600, height: 600, backgroundImage: backgroundImageUrl ? `url(${backgroundImageUrl})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center' }}>
            <canvas id="raffleWheelCanvas" ref={canvasRef} width={600} height={600} style={{ background: 'transparent' }} />
            {centerLogoUrl && (
                <img src={centerLogoUrl} alt="center-logo" style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 120, height: 120, pointerEvents: 'none' }} />
            )}
        </div>
    )
}

function formatName(name: string, mask: boolean) {
    if (!mask) return name
    if (!name || name.length < 2) return '*'
    return name[0] + '*'.repeat(Math.max(1, name.length - 2)) + name[name.length - 1]
}

function rgbaFromString(input: string, opacity = 0.5) {
    // Simple stable hash -> RGB
    let hash = 0
    for (let i = 0; i < input.length; i++) {
        hash = (hash * 31 + input.charCodeAt(i)) | 0
    }
    const r = (hash >>> 16) & 255
    const g = (hash >>> 8) & 255
    const b = hash & 255
    return `rgba(${r}, ${g}, ${b}, ${opacity})`
}
