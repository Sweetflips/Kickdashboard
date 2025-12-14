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

    const lastTargetIndexRef = useRef<number | null>(null)

    useEffect(() => {
        // Load TweenMax (GSAP v2) and Winwheel via CDN if not already loaded
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
                // TweenMax (GSAP v2) - required by Winwheel.js
                await loadScript('https://cdnjs.cloudflare.com/ajax/libs/gsap/2.1.3/TweenMax.min.js')
                await loadScript('https://cdnjs.cloudflare.com/ajax/libs/Winwheel.js/2.7.0/Winwheel.min.js')
                const Winwheel = (window as any).Winwheel

                if (!Winwheel) {
                    console.error('Winwheel not loaded')
                    return
                }

                // Build weighted segments: one segment per entry, sized by ticket count
                const segmentArray: any[] = []
                for (const e of entries) {
                    const color = rgbaFromString(e.username || e.user_id || e.entry_id, sliceOpacity)
                    const segmentSize = (e.tickets / totalTickets) * 360
                    segmentArray.push({
                        fillStyle: color,
                        text: formatName(e.username, maskNames),
                        size: segmentSize,
                    })
                }

                // Create Winwheel instance
                winwheelRef.current = new Winwheel({
                    canvasId: 'raffleWheelCanvas',
                    numSegments: segmentArray.length,
                    outerRadius: 260,
                    innerRadius: 60,
                    textFontSize: 16,
                    textOrientation: 'curved',
                    textAlignment: 'outer',
                    textMargin: 5,
                    segments: segmentArray,
                    pointerAngle: 0, // Pointer at top (0 degrees)
                    animation: {
                        type: 'spinToStop',
                        duration: 5,
                        spins: 6,
                        callbackFinished: (w: any) => {
                            const seg = w.getIndicatedSegment()
                            const segNum = w.getIndicatedSegmentNumber() - 1
                            const winnerEntry = entries[segNum]
                            if (onSpinComplete && winnerEntry) {
                                onSpinComplete(winnerEntry)
                            }
                        }
                    }
                })

                // If targetIndex changed and is provided, animate to that winner
                if (typeof targetIndex === 'number' && targetIndex >= 0 && targetIndex !== lastTargetIndexRef.current) {
                    lastTargetIndexRef.current = targetIndex

                    // Find which entry contains this ticket index
                    const targetEntry = entries.find(e => targetIndex >= e.range_start && targetIndex < e.range_end)
                    if (targetEntry) {
                        const entryIndex = entries.indexOf(targetEntry)
                        const segmentNumber = entryIndex + 1 // Winwheel uses 1-based segment numbers

                        // Use Winwheel's getRandomForSegment to get a random angle within that segment
                        // This ensures we land somewhere in the segment, not just at the edge
                        const stopAt = winwheelRef.current.getRandomForSegment(segmentNumber)

                        // Set stopAngle and start animation
                        winwheelRef.current.animation.stopAngle = stopAt
                        winwheelRef.current.startAnimation()
                    }
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
            {/* Pointer indicator at top (wheel_of_fortune style) */}
            <div
                style={{
                    position: 'absolute',
                    top: 0,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 0,
                    height: 0,
                    borderLeft: '15px solid transparent',
                    borderRight: '15px solid transparent',
                    borderTop: '30px solid #fff',
                    zIndex: 10,
                    filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
                }}
            />
            <canvas id="raffleWheelCanvas" ref={canvasRef} width={600} height={600} style={{ background: 'transparent' }} />
            {centerLogoUrl && (
                <img src={centerLogoUrl} alt="center-logo" style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 120, height: 120, pointerEvents: 'none', zIndex: 5 }} />
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
