import { redirect } from 'next/navigation'

// Feature decommissioned: Challenges removed from Kick Dashboard
// Redirecting to Achievements as the primary feature
export default function ChallengesPage() {
    redirect('/achievements')
}
