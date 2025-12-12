'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

interface UserData {
    id?: number
    username?: string
    email?: string
    profile_picture?: string
    bio?: string
    [key: string]: any
}

interface ProfileDropdownProps {
    user: UserData | null
    onLogout: () => void
}

function ProfileDropdown({ user, onLogout }: ProfileDropdownProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [imageError, setImageError] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)
    const router = useRouter()

    const username = user?.username || user?.name || user?.slug || user?.display_name || 'Loading...'
    const profilePictureRaw = user?.profile_picture || user?.avatar_url || user?.avatar
    // Check for custom profile picture in localStorage
    const [customProfilePicture, setCustomProfilePicture] = useState<string | null>(null)

    useEffect(() => {
        if (user?.id) {
            // Load custom profile picture from database
            const loadCustomPicture = async () => {
                try {
                    const response = await fetch(`/api/user/preferences?kick_user_id=${user.id}`)
                    if (response.ok) {
                        const prefs = await response.json()
                        setCustomProfilePicture(prefs.custom_profile_picture_url || null)
                    } else {
                        // If response is not ok, use defaults
                        console.warn(`Failed to load preferences: ${response.status}`)
                        setCustomProfilePicture(null)
                    }
                } catch (error) {
                    console.error('Failed to load custom profile picture:', error)
                    // Fallback to localStorage for backwards compatibility
                    const savedPicture = localStorage.getItem(`custom_profile_picture_${user.id}`)
                    if (savedPicture) {
                        setCustomProfilePicture(savedPicture)
                    } else {
                        setCustomProfilePicture(null)
                    }
                }
            }
            loadCustomPicture()
        }
    }, [user?.id])

    // Use custom profile picture if available, otherwise use Kick's profile picture
    const profilePicture = customProfilePicture || profilePictureRaw
    const initials = username.charAt(0).toUpperCase()

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside)
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [isOpen])

    // Reset image error when profile picture changes
    useEffect(() => {
        if (profilePicture) {
            setImageError(false)
        }
    }, [profilePicture])

    // Show loading state if user data is not yet loaded
    if (!user) {
        return (
            <div className="flex items-center gap-3 px-3 py-2">
                <div className="animate-pulse">
                    <div className="w-10 h-10 rounded-full bg-kick-surface-hover"></div>
                </div>
                <div className="animate-pulse">
                    <div className="h-4 w-20 bg-kick-surface-hover rounded"></div>
                </div>
            </div>
        )
    }

    // Fallback if username is still not available
    if (!user.username && !user.email) {
        return (
            <div className="flex items-center gap-3 px-3 py-2">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center">
                    <span className="text-white text-sm font-semibold">U</span>
                </div>
                <div className="flex flex-col items-end">
                    <span className="text-sm font-medium text-kick-text">
                        Kick User
                    </span>
                    <span className="text-xs text-kick-text-secondary">
                        Authenticated
                    </span>
                </div>
            </div>
        )
    }

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-kick-surface-hover transition-colors"
            >
                {profilePicture ? (
                    <>
                        <img
                            src={profilePicture}
                            alt={username}
                            width={40}
                            height={40}
                            className={`w-10 h-10 rounded-full object-cover ${imageError ? 'hidden' : ''}`}
                            onError={(e) => {
                                console.error('❌ Image failed to load')
                                console.error('❌ Image src:', profilePicture)
                                setImageError(true)
                            }}
                            onLoad={() => {
                                setImageError(false)
                            }}
                            loading="eager"
                            crossOrigin="anonymous"
                        />
                        {imageError && (
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center">
                                <span className="text-white text-sm font-semibold">{initials}</span>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center">
                        <span className="text-white text-sm font-semibold">{initials}</span>
                    </div>
                )}
                <div className="flex flex-col items-start">
                    <span className="text-sm font-medium text-gray-900 dark:text-kick-text">
                        {username}
                    </span>
                    <span className="text-xs text-gray-600 dark:text-kick-text-secondary">
                        {user?.email || 'Kick User'}
                    </span>
                </div>
                <svg
                    className={`w-4 h-4 text-gray-600 dark:text-kick-text-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-kick-surface rounded-lg shadow-lg border border-gray-200 dark:border-kick-border py-2 z-50">
                    <div className="px-4 py-3 border-b border-gray-200 dark:border-kick-border">
                        <p className="text-sm font-medium text-gray-900 dark:text-kick-text">{username}</p>
                        <p className="text-xs text-gray-600 dark:text-kick-text-secondary truncate">{user?.email || 'No email'}</p>
                    </div>
                    <div className="py-1">
                        <Link
                            href="/profile"
                            onClick={() => setIsOpen(false)}
                            className="flex items-center px-4 py-2 text-sm text-gray-900 dark:text-kick-text hover:bg-gray-100 dark:hover:bg-kick-surface-hover"
                        >
                            <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            Profile & Settings
                        </Link>
                        <Link
                            href="/activity"
                            onClick={() => setIsOpen(false)}
                            className="flex items-center px-4 py-2 text-sm text-gray-900 dark:text-kick-text hover:bg-gray-100 dark:hover:bg-kick-surface-hover"
                        >
                            <span className="w-5 h-5 mr-3 flex items-center justify-center text-[18px] leading-none" aria-hidden="true">
                                📌
                            </span>
                            My Activity
                        </Link>
                    </div>
                    <div className="border-t border-gray-200 dark:border-kick-border py-1">
                        <button
                            onClick={() => {
                                setIsOpen(false)
                                onLogout()
                            }}
                            className="w-full flex items-center px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-kick-surface-hover"
                        >
                            <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                            Logout
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

export default ProfileDropdown
