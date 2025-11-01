'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AppLayout from '@/components/AppLayout'

export default function GiveawaysPage() {
    const router = useRouter()

    useEffect(() => {
        // Redirect to admin giveaways page
        router.replace('/admin/giveaways')
    }, [router])

    return (
        <AppLayout>
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kick-purple"></div>
            </div>
        </AppLayout>
    )
}
