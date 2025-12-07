'use client'

import Link from 'next/link'

export default function Footer() {
    const currentYear = new Date().getFullYear()

    return (
        <footer className="bg-white dark:bg-kick-surface border-t border-gray-200 dark:border-kick-border mt-auto">
            <div className="max-w-7xl mx-auto px-4 py-6">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                    {/* Copyright */}
                    <div className="text-sm text-gray-500 dark:text-kick-text-secondary">
                        © {currentYear} SweetFlips. All rights reserved.
                    </div>

                    {/* Legal Links */}
                    <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
                        <Link
                            href="/legal/terms"
                            className="text-gray-500 dark:text-kick-text-secondary hover:text-gray-900 dark:hover:text-kick-text transition-colors"
                        >
                            Terms of Service
                        </Link>
                        <Link
                            href="/legal/privacy"
                            className="text-gray-500 dark:text-kick-text-secondary hover:text-gray-900 dark:hover:text-kick-text transition-colors"
                        >
                            Privacy Policy
                        </Link>
                        <Link
                            href="/legal/cookies"
                            className="text-gray-500 dark:text-kick-text-secondary hover:text-gray-900 dark:hover:text-kick-text transition-colors"
                        >
                            Cookie Policy
                        </Link>
                        <Link
                            href="/legal/responsible-gaming"
                            className="text-gray-500 dark:text-kick-text-secondary hover:text-gray-900 dark:hover:text-kick-text transition-colors"
                        >
                            Responsible Gaming
                        </Link>
                    </nav>
                </div>
            </div>
        </footer>
    )
}
