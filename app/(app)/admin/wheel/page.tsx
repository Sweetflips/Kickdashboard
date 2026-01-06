import { redirect } from 'next/navigation'

// Feature decommissioned: Wheel overlay (depended on Raffles) removed from Kick Dashboard
export default function AdminWheelPage() {
    redirect('/admin/analytics')
}
