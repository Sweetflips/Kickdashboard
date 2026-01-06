import { redirect } from 'next/navigation'

// Feature decommissioned: Raffles admin removed from Kick Dashboard
export default function AdminRafflesEditPage() {
    redirect('/admin/analytics')
}
