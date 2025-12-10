'use client'

import Footer from '@/components/Footer'
import ThemeToggle from '@/components/ThemeToggle'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const legalPages = [
    { href: '/legal/terms', label: 'Terms of Service', description: 'Rules for using SweetFlips' },
    { href: '/legal/privacy', label: 'Privacy Policy', description: 'How we handle your data' },
    { href: '/legal/cookies', label: 'Cookie Policy', description: 'Cookies and storage we use' },
    { href: '/legal/responsible-gaming', label: 'Responsible Gaming', description: 'Guidelines for healthy participation' },
]

export default function LegalLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()

    return (
        <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-kick-dark">
            {/* Header */}
            <header className="bg-white dark:bg-kick-surface border-b border-gray-200 dark:border-kick-border sticky top-0 z-50">
                <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-3 group">
                        <Image
                            src="/icons/kick.jpg"
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

                {/* Other Legal Pages */}
                <div className="max-w-4xl mx-auto px-4 pb-12">
                    <div className="border-t border-gray-200 dark:border-kick-border pt-8">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-kick-text mb-4">
                            Other Legal Pages
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {legalPages
                                .filter((page) => page.href !== pathname)
                                .map((page) => (
                                    <Link
                                        key={page.href}
                                        href={page.href}
                                        className="flex items-center gap-3 p-4 bg-white dark:bg-kick-surface rounded-xl border border-gray-200 dark:border-kick-border hover:border-kick-green dark:hover:border-kick-green transition-colors group"
                                    >
                                        <div className="flex-shrink-0 w-10 h-10 bg-gray-100 dark:bg-kick-surface-hover rounded-lg flex items-center justify-center group-hover:bg-kick-green/10 transition-colors">
                                            <svg className="w-5 h-5 text-gray-500 dark:text-kick-text-secondary group-hover:text-kick-green transition-colors" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                                            </svg>
                                        </div>
                                        <div>
                                            <div className="font-medium text-gray-900 dark:text-kick-text group-hover:text-kick-green transition-colors">
                                                {page.label}
                                            </div>
                                            <div className="text-sm text-gray-500 dark:text-kick-text-secondary">
                                                {page.description}
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                        </div>
                    </div>
                </div>
            </main>

            {/* Footer */}
            <Footer />
        </div>
    )
}
