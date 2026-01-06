import { redirect } from 'next/navigation'

// Feature decommissioned: Raffles admin removed from Kick Dashboard
export default function AdminRafflesPage() {
    redirect('/admin/analytics')
}
