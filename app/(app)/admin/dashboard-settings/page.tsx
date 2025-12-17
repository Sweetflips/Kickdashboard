'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminDashboardSettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function verify() {
      try {
        const resp = await fetch('/api/admin/verify', { method: 'GET' })
        const data = await resp.json()
        if (!data?.is_admin) {
          router.replace('/')
          return
        }
        if (!cancelled) {
          // Redirect to the new page
          router.replace('/admin/ai-moderator')
        }
      } catch (e: any) {
        if (!cancelled) setLoading(false)
      }
    }
    verify()
    return () => { cancelled = true }
  }, [router])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kick-purple" />
      </div>
    )
  }

  return null
}
