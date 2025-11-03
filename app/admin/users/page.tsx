'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import AppLayout from '@/components/AppLayout'

interface User {
  id: string
  kick_user_id: string
  username: string
  email: string | null
  profile_picture_url: string | null
  is_admin: boolean
  total_points: number
  total_emotes: number
  created_at: string
  last_login_at: string | null
}

export default function UsersPage() {
  const router = useRouter()
  const [userData, setUserData] = useState<any>(null)
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [total, setTotal] = useState(0)
  const limit = 50

  useEffect(() => {
    // Check admin access
    const token = localStorage.getItem('kick_access_token')
    if (!token) {
      router.push('/')
      return
    }

    fetch(`/api/user?access_token=${encodeURIComponent(token)}`)
      .then(res => res.json())
      .then(data => {
        if (!data.is_admin) {
          router.push('/')
          return
        }
        setUserData(data)
        fetchUsers()
      })
      .catch(() => router.push('/'))
  }, [router])

  useEffect(() => {
    if (userData?.is_admin) {
      fetchUsers()
    }
  }, [offset, search, userData])

  const fetchUsers = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('kick_access_token')
      if (!token) return

      const searchParam = search ? `&search=${encodeURIComponent(search)}` : ''
      const response = await fetch(`/api/admin/users?limit=${limit}&offset=${offset}${searchParam}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setUsers(data.users || [])
        setTotal(data.total || 0)
      }
    } catch (error) {
      console.error('Error fetching users:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleAdmin = async (kickUserId: string, currentStatus: boolean) => {
    if (!confirm(`Are you sure you want to ${currentStatus ? 'remove' : 'grant'} admin access for this user?`)) return

    try {
      const token = localStorage.getItem('kick_access_token')
      if (!token) return

      const response = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          kick_user_id: kickUserId,
          is_admin: !currentStatus,
        }),
      })

      if (response.ok) {
        await fetchUsers()
      } else {
        const error = await response.json()
        alert(`Failed to update user: ${error.error}`)
      }
    } catch (error) {
      console.error('Error updating user:', error)
      alert('Failed to update user')
    }
  }

  if (!userData || !userData.is_admin) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kick-purple"></div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-kick-text">User Management</h1>
        </div>

        {/* Search */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Search by username or email..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setOffset(0)
            }}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-kick-border rounded-lg bg-white dark:bg-kick-surface text-gray-900 dark:text-kick-text"
          />
        </div>

        {/* Users Table */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-kick-purple mx-auto"></div>
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-12 text-gray-600 dark:text-kick-text-secondary">
            No users found.
          </div>
        ) : (
          <>
            <div className="bg-white dark:bg-kick-surface rounded-lg shadow-sm border border-gray-200 dark:border-kick-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-kick-border bg-gray-50 dark:bg-kick-dark">
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-kick-text-secondary">User</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-kick-text-secondary">Email</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-kick-text-secondary">Points</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-kick-text-secondary">Emotes</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-kick-text-secondary">Admin</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-kick-text-secondary">Joined</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-kick-text-secondary">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr
                        key={user.id}
                        className="border-b border-gray-100 dark:border-kick-border hover:bg-gray-50 dark:hover:bg-kick-dark transition-colors"
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            {user.profile_picture_url ? (() => {
                              // CloudFront URLs might work directly, kick.com URLs need proxy
                              const isCloudFront = user.profile_picture_url.includes('cloudfront.net') || user.profile_picture_url.includes('amazonaws.com')
                              const imageSrc = isCloudFront
                                ? user.profile_picture_url
                                : `/api/image-proxy?url=${encodeURIComponent(user.profile_picture_url)}`

                              return (
                                <img
                                  src={imageSrc}
                                  alt={user.username}
                                  width={32}
                                  height={32}
                                  className="rounded-full"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement
                                    // If direct URL failed and it's CloudFront, try proxy
                                    if (isCloudFront && !target.src.includes('/api/image-proxy') && user.profile_picture_url) {
                                      target.src = `/api/image-proxy?url=${encodeURIComponent(user.profile_picture_url)}`
                                    } else {
                                      target.src = '/kick.jpg'
                                    }
                                  }}
                                />
                              )
                            })() : (
                              <Image
                                src="/kick.jpg"
                                alt={user.username}
                                width={32}
                                height={32}
                                className="rounded-full"
                                unoptimized
                              />
                            )}
                            <span className="font-medium text-gray-900 dark:text-kick-text">{user.username}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-gray-600 dark:text-kick-text-secondary">
                          {user.email || '-'}
                        </td>
                        <td className="py-3 px-4 text-right text-gray-900 dark:text-kick-text">
                          {user.total_points.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right text-gray-900 dark:text-kick-text">
                          {user.total_emotes.toLocaleString()}
                        </td>
                        <td className="py-3 px-4">
                          {user.is_admin ? (
                            <span className="px-2 py-1 rounded text-xs bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200">
                              Admin
                            </span>
                          ) : (
                            <span className="px-2 py-1 rounded text-xs bg-gray-100 dark:bg-kick-dark text-gray-600 dark:text-kick-text-secondary">
                              User
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-gray-600 dark:text-kick-text-secondary text-sm">
                          {new Date(user.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4">
                          <button
                            onClick={() => toggleAdmin(user.kick_user_id, user.is_admin)}
                            className={`px-3 py-1 rounded text-sm ${
                              user.is_admin
                                ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 hover:bg-red-200 dark:hover:bg-red-900/50'
                                : 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 hover:bg-green-200 dark:hover:bg-green-900/50'
                            }`}
                          >
                            {user.is_admin ? 'Remove Admin' : 'Make Admin'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600 dark:text-kick-text-secondary">
                Showing {offset + 1} to {Math.min(offset + limit, total)} of {total} users
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                  disabled={offset === 0}
                  className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-kick-surface text-gray-700 dark:text-kick-text hover:bg-gray-200 dark:hover:bg-kick-surface-hover disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => setOffset(offset + limit)}
                  disabled={offset + limit >= total}
                  className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-kick-surface text-gray-700 dark:text-kick-text hover:bg-gray-200 dark:hover:bg-kick-surface-hover disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  )
}
