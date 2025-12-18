'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function LandingPage() {
    const router = useRouter()

    return (
        <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-kick-dark dark:via-kick-surface dark:to-kick-dark">
            {/* Header */}
            <header className="bg-gradient-to-r from-kick-green via-kick-green-dark to-kick-green/90 text-white shadow-lg">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="relative w-12 h-12 sm:w-16 sm:h-16">
                                <Image
                                    src="/rewards/emerald-sub.png"
                                    alt="SweetFlips Logo"
                                    width={64}
                                    height={64}
                                    className="w-full h-full object-contain"
                                    unoptimized
                                />
                            </div>
                            <div>
                                <h1 className="text-2xl sm:text-3xl font-bold">SweetFlips Rewards</h1>
                                <p className="text-sm sm:text-base text-white/90">The most rewarding gambling community</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <Link
                                href="/login"
                                className="px-4 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-lg font-medium transition-all duration-200 hover:scale-105"
                            >
                                Sign In
                            </Link>
                            <Link
                                href="/login"
                                className="px-6 py-2 bg-white text-kick-green-dark rounded-lg font-semibold hover:bg-white/90 transition-all duration-200 hover:scale-105 shadow-md"
                            >
                                Get Started
                            </Link>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1">
                {/* Hero Section */}
                <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
                    <div className="text-center mb-16">
                        <div className="inline-flex items-center justify-center mb-8">
                            <div className="relative w-32 h-32 sm:w-40 sm:h-40">
                                <Image
                                    src="/rewards/emerald-sub.png"
                                    alt="SweetFlips"
                                    width={160}
                                    height={160}
                                    className="w-full h-full object-contain drop-shadow-2xl"
                                    unoptimized
                                />
                            </div>
                        </div>
                        <h2 className="text-4xl sm:text-5xl md:text-6xl font-bold text-gray-900 dark:text-kick-text mb-6">
                            Earn <span className="text-kick-green">Sweet Coins</span> While You Watch
                        </h2>
                        <p className="text-xl sm:text-2xl text-gray-600 dark:text-kick-text-secondary mb-8 max-w-3xl mx-auto">
                            Join the most rewarding gambling community on Kick. Chat, earn coins, enter raffles, and win amazing prizes!
                        </p>
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                            <button
                                onClick={() => router.push('/login')}
                                className="px-8 py-4 bg-gradient-to-r from-kick-green to-kick-green-dark text-white font-semibold text-lg rounded-xl shadow-xl hover:shadow-2xl transition-all duration-200 hover:scale-105"
                            >
                                Start Earning Now
                            </button>
                            <Link
                                href="https://kick.com/sweetflips"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-8 py-4 bg-white dark:bg-kick-surface border-2 border-kick-green text-kick-green-dark dark:text-kick-green font-semibold text-lg rounded-xl hover:bg-gray-50 dark:hover:bg-kick-surface-hover transition-all duration-200"
                            >
                                Watch on Kick
                            </Link>
                        </div>
                    </div>

                    {/* Features Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-20">
                        <div className="bg-white dark:bg-kick-surface rounded-2xl p-8 shadow-lg border border-gray-200 dark:border-kick-border hover:shadow-xl transition-all duration-200 hover:-translate-y-1">
                            <div className="w-16 h-16 bg-kick-green/20 rounded-full flex items-center justify-center mb-6">
                                <svg className="w-8 h-8 text-kick-green" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900 dark:text-kick-text mb-4">Earn Sweet Coins</h3>
                            <p className="text-gray-600 dark:text-kick-text-secondary">
                                Chat during live streams to earn Sweet Coins automatically. The more you engage, the more you earn!
                            </p>
                        </div>

                        <div className="bg-white dark:bg-kick-surface rounded-2xl p-8 shadow-lg border border-gray-200 dark:border-kick-border hover:shadow-xl transition-all duration-200 hover:-translate-y-1">
                            <div className="w-16 h-16 bg-kick-purple/20 rounded-full flex items-center justify-center mb-6">
                                <svg className="w-8 h-8 text-kick-purple" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900 dark:text-kick-text mb-4">Enter Raffles</h3>
                            <p className="text-gray-600 dark:text-kick-text-secondary">
                                Use your Sweet Coins to buy raffle tickets and win amazing prizes. Multiple draws every day!
                            </p>
                        </div>

                        <div className="bg-white dark:bg-kick-surface rounded-2xl p-8 shadow-lg border border-gray-200 dark:border-kick-border hover:shadow-xl transition-all duration-200 hover:-translate-y-1">
                            <div className="w-16 h-16 bg-kick-green/20 rounded-full flex items-center justify-center mb-6">
                                <svg className="w-8 h-8 text-kick-green" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                </svg>
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900 dark:text-kick-text mb-4">Climb Leaderboards</h3>
                            <p className="text-gray-600 dark:text-kick-text-secondary">
                                Compete with other community members and see your name at the top of the leaderboard!
                            </p>
                        </div>
                    </div>

                    {/* Stats Section */}
                    <div className="mt-20 bg-gradient-to-r from-kick-purple/10 to-kick-green/10 dark:from-kick-purple/20 dark:to-kick-green/20 rounded-2xl p-8 sm:p-12 border border-kick-purple/20">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
                            <div>
                                <div className="text-3xl sm:text-4xl font-bold text-kick-green mb-2">24/7</div>
                                <div className="text-sm sm:text-base text-gray-600 dark:text-kick-text-secondary">Live Rewards</div>
                            </div>
                            <div>
                                <div className="text-3xl sm:text-4xl font-bold text-kick-purple mb-2">1000+</div>
                                <div className="text-sm sm:text-base text-gray-600 dark:text-kick-text-secondary">Active Members</div>
                            </div>
                            <div>
                                <div className="text-3xl sm:text-4xl font-bold text-kick-green mb-2">Daily</div>
                                <div className="text-sm sm:text-base text-gray-600 dark:text-kick-text-secondary">Raffle Draws</div>
                            </div>
                            <div>
                                <div className="text-3xl sm:text-4xl font-bold text-kick-purple mb-2">Free</div>
                                <div className="text-sm sm:text-base text-gray-600 dark:text-kick-text-secondary">To Join</div>
                            </div>
                        </div>
                    </div>
                </section>
            </main>

            {/* Footer */}
            <footer className="bg-gradient-to-r from-kick-purple via-purple-800 to-kick-purple text-white mt-auto">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="flex items-center gap-4">
                            <div className="relative w-12 h-12">
                                <Image
                                    src="/rewards/emerald-sub.png"
                                    alt="SweetFlips"
                                    width={48}
                                    height={48}
                                    className="w-full h-full object-contain"
                                    unoptimized
                                />
                            </div>
                            <div>
                                <div className="text-xl font-bold">SWEETFLIPS.GG</div>
                                <div className="text-sm text-white/80">The most rewarding gambling community</div>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center justify-center gap-6 text-sm">
                            <Link href="/legal/terms" className="hover:text-white/80 transition-colors">
                                Terms
                            </Link>
                            <Link href="/legal/privacy" className="hover:text-white/80 transition-colors">
                                Privacy
                            </Link>
                            <Link href="/legal/cookies" className="hover:text-white/80 transition-colors">
                                Cookies
                            </Link>
                            <Link href="/legal/responsible-gaming" className="hover:text-white/80 transition-colors">
                                Responsible Gaming
                            </Link>
                        </div>
                    </div>
                    <div className="mt-6 pt-6 border-t border-white/20 text-center text-sm text-white/60">
                        © {new Date().getFullYear()} SweetFlips. All rights reserved.
                    </div>
                </div>
            </footer>
        </div>
    )
}

