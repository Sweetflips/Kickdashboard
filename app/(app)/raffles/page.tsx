import { redirect } from 'next/navigation'

// Feature decommissioned: Raffles removed from Kick Dashboard
// Redirecting to Achievements as the primary feature
export default function RafflesPage() {
    redirect('/achievements')
}
