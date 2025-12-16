'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import RaffleWheel from '@/components/RaffleWheel'

type WheelStateResponse = {
  success: boolean
  state: {
    mode: string
    raffle_id: string | null
    title: string | null
    locked: boolean
    wheel_background_url: string | null
    center_logo_url: string | null
    slice_opacity: number
  }
  snapshot: {
    mode: string
    raffle_id: string | null
    entries: Array<{
      entry_id: string
      user_id: string
      username: string
      tickets: number
      range_start: number
      range_end: number
      source?: string
    }>
    totalTickets: number
  }
  spin:
    | {
        version: number
        target_ticket_index: number
        winner_label: string
      }
    | null
  error?: string
}

export default function WheelOverlayPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [entries, setEntries] = useState<any[]>([])
  const [totalTickets, setTotalTickets] = useState(0)
  const [title, setTitle] = useState<string | null>(null)
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null)
  const [centerLogoUrl, setCenterLogoUrl] = useState<string | null>(null)
  const [sliceOpacity, setSliceOpacity] = useState(0.5)

  const [targetIndex, setTargetIndex] = useState<number | null>(null)
  const [winnerLabel, setWinnerLabel] = useState<string | null>(null)

  const lastSpinVersion = useRef<number>(0)

  const overlayKey = useMemo(() => {
    if (typeof window === 'undefined') return ''
    return new URLSearchParams(window.location.search).get('key') || ''
  }, [])

  // Make page background transparent for OBS overlay
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.style.background = 'transparent'
      document.documentElement.style.backgroundColor = 'transparent'
      document.body.style.background = 'transparent'
      document.body.style.backgroundColor = 'transparent'
      // Remove any padding/margin
      document.body.style.margin = '0'
      document.body.style.padding = '0'
    }
  }, [])

  useEffect(() => {
    let mounted = true
    let timer: any = null

    const poll = async () => {
      try {
        const url = overlayKey ? `/api/wheel/state?key=${encodeURIComponent(overlayKey)}` : '/api/wheel/state'
        const resp = await fetch(url, { cache: 'no-store' })
        const data = (await resp.json()) as WheelStateResponse

        if (!mounted) return

        if (!resp.ok) {
          setError(data?.error || 'Failed to load wheel state')
          setLoading(false)
          return
        }

        setError(null)
        setTitle(data.state?.title || null)
        setBackgroundUrl(data.state?.wheel_background_url || null)
        setCenterLogoUrl(data.state?.center_logo_url || null)
        setSliceOpacity(Number(data.state?.slice_opacity ?? 0.5))

        setEntries(data.snapshot?.entries || [])
        setTotalTickets(data.snapshot?.totalTickets || 0)

        if (data.spin && typeof data.spin.version === 'number') {
          if (data.spin.version !== lastSpinVersion.current) {
            lastSpinVersion.current = data.spin.version
            setWinnerLabel(null)
            setTargetIndex(data.spin.target_ticket_index)
            setWinnerLabel(data.spin.winner_label || null)
          }
        }

        setLoading(false)
      } catch (e) {
        if (!mounted) return
        setError('Failed to load wheel state')
        setLoading(false)
      } finally {
        if (mounted) {
          timer = setTimeout(poll, 1000)
        }
      }
    }

    poll()
    return () => {
      mounted = false
      if (timer) clearTimeout(timer)
    }
  }, [overlayKey])

  // For OBS overlay: completely blank page, only show wheel
  // Hide all messages for clean overlay
  if (entries.length === 0 || totalTickets <= 0) {
    return <div style={{ width: '100vw', height: '100vh', background: 'transparent' }} />
  }

  return (
    <div style={{ width: '100vw', height: '100vh', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: 0, padding: 0 }}>
      <RaffleWheel
        entries={entries as any}
        totalTickets={totalTickets}
        targetIndex={targetIndex}
        backgroundImageUrl={backgroundUrl}
        centerLogoUrl={centerLogoUrl}
        sliceOpacity={sliceOpacity}
        maskNames={false}
      />
    </div>
  )
}

