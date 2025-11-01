'use client'

import { useEffect, useRef, useState } from 'react'

interface Segment {
  id: string
  label: string
  color: string
  weight: number
}

interface GiveawayWheelProps {
  segments: Segment[]
  onSpinComplete?: (segmentIndex: number) => void
  spinning?: boolean
  winnerIndex?: number | null
  size?: number
}

export default function GiveawayWheel({
  segments,
  onSpinComplete,
  spinning = false,
  winnerIndex = null,
  size = 400,
}: GiveawayWheelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [rotation, setRotation] = useState(0)
  const [isSpinning, setIsSpinning] = useState(false)
  const animationFrameRef = useRef<number>()

  useEffect(() => {
    if (segments.length === 0) return

    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const centerX = size / 2
    const centerY = size / 2
    const radius = size / 2 - 20

    // Clear canvas
    ctx.clearRect(0, 0, size, size)

    // Calculate angle per segment
    const anglePerSegment = (2 * Math.PI) / segments.length

    // Draw segments
    segments.forEach((segment, index) => {
      const startAngle = index * anglePerSegment + rotation
      const endAngle = (index + 1) * anglePerSegment + rotation

      ctx.beginPath()
      ctx.moveTo(centerX, centerY)
      ctx.arc(centerX, centerY, radius, startAngle, endAngle)
      ctx.closePath()

      // Fill segment
      ctx.fillStyle = segment.color
      ctx.fill()

      // Draw border
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.stroke()

      // Draw label
      ctx.save()
      ctx.translate(centerX, centerY)
      ctx.rotate(startAngle + anglePerSegment / 2)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#ffffff'
      ctx.font = `bold ${Math.max(12, size / segments.length / 3)}px Arial`

      const labelY = radius * 0.7
      ctx.fillText(segment.label, 0, -labelY)
      ctx.restore()
    })

    // Draw center circle
    ctx.beginPath()
    ctx.arc(centerX, centerY, 30, 0, 2 * Math.PI)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 3
    ctx.stroke()

    // Draw pointer
    ctx.beginPath()
    ctx.moveTo(centerX, centerY - radius - 10)
    ctx.lineTo(centerX - 15, centerY - radius - 30)
    ctx.lineTo(centerX + 15, centerY - radius - 30)
    ctx.closePath()
    ctx.fillStyle = '#ff0000'
    ctx.fill()
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 2
    ctx.stroke()
  }, [segments, rotation, size])

  useEffect(() => {
    if (spinning && !isSpinning) {
      setIsSpinning(true)
      spin()
    }
  }, [spinning])

  useEffect(() => {
    if (winnerIndex !== null && isSpinning) {
      spinToWinner(winnerIndex)
    }
  }, [winnerIndex])

  const spin = () => {
    if (segments.length === 0) return

    const startTime = Date.now()
    const duration = 3000 + Math.random() * 2000 // 3-5 seconds
    const baseRotation = rotation
    const spins = 5 + Math.random() * 5 // 5-10 full rotations

    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)

      // Easing function (ease-out cubic)
      const easeOut = 1 - Math.pow(1 - progress, 3)

      const newRotation = baseRotation + spins * 2 * Math.PI * easeOut
      setRotation(newRotation)

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate)
      } else {
        setIsSpinning(false)
        if (onSpinComplete) {
          // Calculate which segment is selected (top is -PI/2)
          const normalizedRotation = ((rotation % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
          const pointerAngle = -Math.PI / 2
          const segmentAngle = (2 * Math.PI) / segments.length

          let selectedIndex = Math.floor((pointerAngle - normalizedRotation + Math.PI * 2) / segmentAngle) % segments.length
          selectedIndex = (selectedIndex + segments.length) % segments.length

          onSpinComplete(selectedIndex)
        }
      }
    }

    animate()
  }

  const spinToWinner = (targetIndex: number) => {
    if (segments.length === 0) return

    const startTime = Date.now()
    const duration = 4000 + Math.random() * 2000 // 4-6 seconds
    const baseRotation = rotation
    const spins = 8 + Math.random() * 4 // 8-12 full rotations
    const segmentAngle = (2 * Math.PI) / segments.length

    // Calculate target rotation so winner is at top
    const targetRotation = -targetIndex * segmentAngle - segmentAngle / 2 + Math.PI / 2

    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)

      // Easing function (ease-out cubic)
      const easeOut = 1 - Math.pow(1 - progress, 3)

      const newRotation = baseRotation + spins * 2 * Math.PI + targetRotation * easeOut
      setRotation(newRotation)

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate)
      } else {
        setIsSpinning(false)
        if (onSpinComplete) {
          onSpinComplete(targetIndex)
        }
      }
    }

    animate()
  }

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  return (
    <div className="relative inline-block">
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className="rounded-full shadow-lg"
        style={{ transform: `rotate(${rotation}rad)` }}
      />
      {isSpinning && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="animate-spin text-4xl">🎰</div>
        </div>
      )}
    </div>
  )
}

