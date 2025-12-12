import { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Responsible Gaming | SweetFlips',
    description: 'Responsible gaming guidelines for SweetFlips raffle and rewards system',
}

export default function ResponsibleGaming() {
    return (
        <div className="max-w-4xl mx-auto px-4 py-12">
            <div className="bg-white dark:bg-kick-surface rounded-2xl shadow-sm border border-gray-200 dark:border-kick-border p-8 md:p-12">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-kick-text mb-2">
                    Responsible Gaming
                </h1>
                <p className="text-sm text-gray-500 dark:text-kick-text-secondary mb-8">
                    Last updated: December 7, 2024
                </p>

                <div className="prose prose-gray dark:prose-invert max-w-none">
                    {/* Important Notice Banner */}
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-6 mb-8">
                        <div className="flex items-start gap-3">
                            <svg className="w-6 h-6 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                            <div>
                                <h3 className="font-semibold text-amber-800 dark:text-amber-200 mb-1">Important Notice</h3>
                                <p className="text-sm text-amber-700 dark:text-amber-300">
                                    SweetFlips raffles and giveaways are for entertainment purposes only. Sweet Coins are earned
                                    through community participation and have no monetary value. No real money is wagered or
                                    can be won through our Sweet Coins system.
                                </p>
                            </div>
                        </div>
                    </div>

                    <section className="mb-8">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            1. Our Commitment
                        </h2>
                        <p className="text-gray-600 dark:text-kick-text-secondary mb-4">
                            SweetFlips is committed to providing a fun and safe entertainment experience for our
                            community. While our raffle system uses virtual Sweet Coins (not real money), we believe
                            in promoting responsible participation in all gaming-like activities.
                        </p>
                        <p className="text-gray-600 dark:text-kick-text-secondary">
                            We encourage all users to engage with our platform in a healthy, balanced manner that
                            does not negatively impact their daily lives, relationships, or well-being.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            2. Understanding Our System
                        </h2>
                        <div className="bg-gray-50 dark:bg-kick-surface-hover rounded-xl p-6 mb-4">
                            <h3 className="text-lg font-medium text-gray-800 dark:text-kick-text mb-3">
                                How Sweet Coins Work
                            </h3>
                            <ul className="list-disc pl-6 text-gray-600 dark:text-kick-text-secondary space-y-2">
                                <li>Sweet Coins are earned by watching streams and participating in chat</li>
                                <li>Sweet Coins cannot be purchased with real money</li>
                                <li>Sweet Coins cannot be exchanged for cash or real currency</li>
                                <li>Sweet Coins have no monetary value outside the platform</li>
                            </ul>
                        </div>

                        <div className="bg-gray-50 dark:bg-kick-surface-hover rounded-xl p-6">
                            <h3 className="text-lg font-medium text-gray-800 dark:text-kick-text mb-3">
                                How Raffles Work
                            </h3>
                            <ul className="list-disc pl-6 text-gray-600 dark:text-kick-text-secondary space-y-2">
                                <li>Raffles allow you to spend points for a chance to win prizes</li>
                                <li>Winners are selected randomly and fairly</li>
                                <li>Past results do not influence future outcomes</li>
                                <li>There is no guaranteed way to win</li>
                            </ul>
                        </div>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            3. Guidelines for Healthy Participation
                        </h2>
                        <div className="space-y-4">
                            <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-xl">
                                <svg className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                                <div>
                                    <h3 className="font-medium text-green-800 dark:text-green-200">Set Time Limits</h3>
                                    <p className="text-sm text-green-700 dark:text-green-300">
                                        Decide in advance how much time you'll spend on the platform each day and stick to it.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-xl">
                                <svg className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                                <div>
                                    <h3 className="font-medium text-green-800 dark:text-green-200">Balance Your Activities</h3>
                                    <p className="text-sm text-green-700 dark:text-green-300">
                                        Ensure platform participation doesn't interfere with work, school, relationships, or other responsibilities.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-xl">
                                <svg className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                                <div>
                                    <h3 className="font-medium text-green-800 dark:text-green-200">Participate for Fun</h3>
                                    <p className="text-sm text-green-700 dark:text-green-300">
                                        Remember that raffles are meant to be entertaining. Don't participate if it causes stress or anxiety.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-xl">
                                <svg className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                                <div>
                                    <h3 className="font-medium text-green-800 dark:text-green-200">Accept Outcomes</h3>
                                    <p className="text-sm text-green-700 dark:text-green-300">
                                        Understand that losing is part of any random-chance system. Don't chase losses or feel entitled to win.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            4. Warning Signs
                        </h2>
                        <p className="text-gray-600 dark:text-kick-text-secondary mb-4">
                            Consider taking a break if you experience any of the following:
                        </p>
                        <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-6">
                            <ul className="list-disc pl-6 text-red-700 dark:text-red-300 space-y-2">
                                <li>Spending more time on the platform than intended</li>
                                <li>Feeling anxious or irritable when not participating</li>
                                <li>Neglecting responsibilities or relationships due to platform use</li>
                                <li>Constantly thinking about upcoming raffles</li>
                                <li>Feeling upset or frustrated after not winning</li>
                                <li>Using the platform to escape problems or negative emotions</li>
                            </ul>
                        </div>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            5. Self-Exclusion
                        </h2>
                        <p className="text-gray-600 dark:text-kick-text-secondary mb-4">
                            If you feel you need a break from the platform, you can:
                        </p>
                        <ul className="list-disc pl-6 text-gray-600 dark:text-kick-text-secondary space-y-2">
                            <li>Log out and take a break for as long as you need</li>
                            <li>Contact us to request temporary account suspension</li>
                            <li>Request permanent account deletion through our support channels</li>
                        </ul>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            6. Age Restrictions
                        </h2>
                        <p className="text-gray-600 dark:text-kick-text-secondary">
                            Users must be 18 years or older to use SweetFlips. This age requirement exists because
                            our platform includes raffle features that, while not involving real money, simulate
                            chance-based activities that should only be accessible to adults.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            7. Resources
                        </h2>
                        <p className="text-gray-600 dark:text-kick-text-secondary mb-4">
                            If you or someone you know is struggling with problematic gaming or gambling behaviors,
                            the following resources may help:
                        </p>
                        <div className="space-y-3">
                            <div className="bg-gray-50 dark:bg-kick-surface-hover rounded-xl p-4">
                                <h3 className="font-medium text-gray-800 dark:text-kick-text">National Council on Problem Gambling</h3>
                                <p className="text-sm text-gray-600 dark:text-kick-text-secondary">
                                    1-800-522-4700 | <span className="font-mono">ncpgambling.org</span>
                                </p>
                            </div>
                            <div className="bg-gray-50 dark:bg-kick-surface-hover rounded-xl p-4">
                                <h3 className="font-medium text-gray-800 dark:text-kick-text">Gamblers Anonymous</h3>
                                <p className="text-sm text-gray-600 dark:text-kick-text-secondary">
                                    <span className="font-mono">gamblersanonymous.org</span>
                                </p>
                            </div>
                            <div className="bg-gray-50 dark:bg-kick-surface-hover rounded-xl p-4">
                                <h3 className="font-medium text-gray-800 dark:text-kick-text">GamCare (UK)</h3>
                                <p className="text-sm text-gray-600 dark:text-kick-text-secondary">
                                    0808 8020 133 | <span className="font-mono">gamcare.org.uk</span>
                                </p>
                            </div>
                        </div>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            8. Contact Us
                        </h2>
                        <p className="text-gray-600 dark:text-kick-text-secondary">
                            If you have concerns about your platform usage or would like to discuss self-exclusion
                            options, please reach out through our Discord or Telegram channels. We're here to help.
                        </p>
                    </section>
                </div>
            </div>
        </div>
    )
}
