import { redirect } from 'next/navigation'

// Feature decommissioned: Shop (Raffles/Challenges) removed from Kick Dashboard
// Redirecting to Achievements as the primary feature
export default function ShopPage() {
    redirect('/achievements')
}
