'use client'

import { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'

interface ThemeToggleProps {
  className?: string
  variant?: 'button' | 'switch'
}

export default function ThemeToggle({ className = '', variant = 'switch' }: ThemeToggleProps) {
  const [mounted, setMounted] = useState(false)
  const { theme, setTheme, resolvedTheme } = useTheme()

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className={`w-11 h-6 bg-kick-surface-hover rounded-full ${className}`}></div>
    )
  }

  const isDark = resolvedTheme === 'dark'

  if (variant === 'button') {
    return (
      <button
        onClick={() => setTheme(isDark ? 'light' : 'dark')}
        className={`p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-kick-surface-hover transition-colors ${className}`}
        aria-label="Toggle theme"
      >
        {isDark ? (
          <svg className="w-5 h-5 text-gray-900 dark:text-kick-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        ) : (
          <svg className="w-5 h-5 text-gray-900 dark:text-kick-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        )}
      </button>
    )
  }

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-kick-purple focus:ring-offset-2 ${
        isDark ? 'bg-kick-purple' : 'bg-kick-surface-hover'
      } ${className}`}
      aria-label="Toggle theme"
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          isDark ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}
