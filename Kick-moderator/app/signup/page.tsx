'use client'

import { useRouter } from 'next/navigation'
import { Suspense, useEffect } from 'react'

function SignupContent() {
    const router = useRouter()

    useEffect(() => {
        // Get ref from URL and redirect to login
        const params = new URLSearchParams(window.location.search)
        const ref = params.get('ref')
        
        const loginPath = ref ? `/login?ref=${encodeURIComponent(ref)}` : '/login'
        router.push(loginPath)
    }, [router])

    return (
        <div className="flex items-center justify-center h-screen">
            <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kick-purple mx-auto mb-4"></div>
                <p className="text-gray-600 dark:text-gray-400">Redirecting to signup...</p>
            </div>
        </div>
    )
}

export default function SignupPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="text-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kick-purple mx-auto mb-4"></div></div></div>}>
            <SignupContent />
        </Suspense>
    )
}
