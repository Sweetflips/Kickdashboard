import { redirect } from 'next/navigation'

// Feature decommissioned: Raffles admin removed from Kick Dashboard
export default function AdminRafflesCreatePage() {
    redirect('/admin/analytics')
}
