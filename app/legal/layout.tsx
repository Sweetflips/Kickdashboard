'use client'

import Footer from '@/components/Footer'
import ThemeToggle from '@/components/ThemeToggle'
import Image from 'next/image'
import Link from 'next/link'

export default function LegalLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-kick-dark">
            {/* Header */}
            <header className="bg-white dark:bg-kick-surface border-b border-gray-200 dark:border-kick-border sticky top-0 z-50">
                <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-3 group">
                        <Image
                            src="/kick.jpg"
                            alt="SweetFlips"
                            width={32}
                            height={32}
                            className="rounded-lg"
                        />
                        <span className="font-semibold text-gray-900 dark:text-kick-text group-hover:text-kick-green transition-colors">
                            SweetFlips
                        </span>
                    </Link>
                    <div className="flex items-center gap-4">
                        <ThemeToggle variant="button" />
                        <Link
                            href="/login"
                            className="text-sm font-medium text-gray-600 dark:text-kick-text-secondary hover:text-gray-900 dark:hover:text-kick-text transition-colors"
                        >
                            Sign In
                        </Link>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1">
                {children}
            </main>

            {/* Footer */}
            <Footer />
        </div>
    )
}
