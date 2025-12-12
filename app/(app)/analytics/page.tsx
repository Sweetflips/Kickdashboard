'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AnalyticsPage() {
    const router = useRouter()

    useEffect(() => {
        // Redirect to admin analytics page
        router.replace('/admin/analytics')
    }, [router])

    return (
        <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kick-purple"></div>
        </div>
    )
}
