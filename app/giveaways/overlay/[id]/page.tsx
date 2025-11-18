'use client'

import GiveawayOverlay from '@/components/GiveawayOverlay'

export default function GiveawayOverlayPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams?: { transparent?: string }
}) {
  const { id } = params
  const { transparent } = searchParams || {}

  return (
    <GiveawayOverlay
      giveawayId={id}
      transparent={transparent === 'true'}
    />
  )
}
