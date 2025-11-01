'use client'

import { use } from 'react'
import GiveawayOverlay from '@/components/GiveawayOverlay'

export default function GiveawayOverlayPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ transparent?: string }>
}) {
  const { id } = use(params)
  const { transparent } = use(searchParams)

  return (
    <GiveawayOverlay
      giveawayId={id}
      transparent={transparent === 'true'}
    />
  )
}

