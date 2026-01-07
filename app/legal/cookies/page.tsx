import { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Cookie Policy | SweetFlips',
    description: 'Cookie Policy for SweetFlips - How we use cookies and similar technologies',
}

export default function CookiePolicy() {
    return (
        <div className="max-w-4xl mx-auto px-4 py-12">
            <div className="bg-white dark:bg-kick-surface rounded-2xl shadow-sm border border-gray-200 dark:border-kick-border p-8 md:p-12">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-kick-text mb-2">
                    Cookie Policy
                </h1>
                <p className="text-sm text-gray-500 dark:text-kick-text-secondary mb-8">
                    Last updated: December 20, 2024
                </p>

                <div className="prose prose-gray dark:prose-invert max-w-none">
                    <section className="mb-8">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            1. What Are Cookies?
                        </h2>
                        <p className="text-gray-600 dark:text-kick-text-secondary">
                            Cookies are small text files stored on your device when you visit a website. They help
                            websites remember your preferences and improve your browsing experience. We also use
                            similar technologies like local storage and session storage.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            2. How We Use Cookies
                        </h2>
                        <p className="text-gray-600 dark:text-kick-text-secondary mb-4">
                            Sweetflips Holdings Limited (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) uses cookies and similar technologies for the following purposes:
                        </p>

                        <div className="bg-gray-50 dark:bg-kick-surface-hover rounded-xl p-6 mb-4">
                            <h3 className="text-lg font-medium text-gray-800 dark:text-kick-text mb-3">
                                Essential Cookies
                            </h3>
                            <p className="text-gray-600 dark:text-kick-text-secondary mb-2">
                                These cookies are necessary for the Service to function properly.
                            </p>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left border-b border-gray-200 dark:border-kick-border">
                                        <th className="py-2 text-gray-700 dark:text-kick-text">Cookie</th>
                                        <th className="py-2 text-gray-700 dark:text-kick-text">Purpose</th>
                                        <th className="py-2 text-gray-700 dark:text-kick-text">Duration</th>
                                    </tr>
                                </thead>
                                <tbody className="text-gray-600 dark:text-kick-text-secondary">
                                    <tr className="border-b border-gray-100 dark:border-kick-border/50">
                                        <td className="py-2 font-mono text-xs">kick_access_token</td>
                                        <td className="py-2">Authentication with Kick</td>
                                        <td className="py-2">3 months</td>
                                    </tr>
                                    <tr className="border-b border-gray-100 dark:border-kick-border/50">
                                        <td className="py-2 font-mono text-xs">kick_refresh_token</td>
                                        <td className="py-2">Token refresh capability</td>
                                        <td className="py-2">3 months</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <div className="bg-gray-50 dark:bg-kick-surface-hover rounded-xl p-6 mb-4">
                            <h3 className="text-lg font-medium text-gray-800 dark:text-kick-text mb-3">
                                Preference Cookies
                            </h3>
                            <p className="text-gray-600 dark:text-kick-text-secondary mb-2">
                                These cookies remember your preferences and settings.
                            </p>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left border-b border-gray-200 dark:border-kick-border">
                                        <th className="py-2 text-gray-700 dark:text-kick-text">Cookie/Storage</th>
                                        <th className="py-2 text-gray-700 dark:text-kick-text">Purpose</th>
                                        <th className="py-2 text-gray-700 dark:text-kick-text">Duration</th>
                                    </tr>
                                </thead>
                                <tbody className="text-gray-600 dark:text-kick-text-secondary">
                                    <tr className="border-b border-gray-100 dark:border-kick-border/50">
                                        <td className="py-2 font-mono text-xs">theme</td>
                                        <td className="py-2">Dark/light mode preference</td>
                                        <td className="py-2">Persistent</td>
                                    </tr>
                                    <tr className="border-b border-gray-100 dark:border-kick-border/50">
                                        <td className="py-2 font-mono text-xs">is_admin</td>
                                        <td className="py-2">Admin status cache</td>
                                        <td className="py-2">Session</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <div className="bg-gray-50 dark:bg-kick-surface-hover rounded-xl p-6">
                            <h3 className="text-lg font-medium text-gray-800 dark:text-kick-text mb-3">
                                Local Storage
                            </h3>
                            <p className="text-gray-600 dark:text-kick-text-secondary mb-2">
                                We use browser local storage for the following:
                            </p>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left border-b border-gray-200 dark:border-kick-border">
                                        <th className="py-2 text-gray-700 dark:text-kick-text">Key</th>
                                        <th className="py-2 text-gray-700 dark:text-kick-text">Purpose</th>
                                    </tr>
                                </thead>
                                <tbody className="text-gray-600 dark:text-kick-text-secondary">
                                    <tr className="border-b border-gray-100 dark:border-kick-border/50">
                                        <td className="py-2 font-mono text-xs">kick_access_token</td>
                                        <td className="py-2">Backup authentication storage</td>
                                    </tr>
                                    <tr className="border-b border-gray-100 dark:border-kick-border/50">
                                        <td className="py-2 font-mono text-xs">kick_refresh_token</td>
                                        <td className="py-2">Backup refresh token storage</td>
                                    </tr>
                                    <tr>
                                        <td className="py-2 font-mono text-xs">chat_preferences</td>
                                        <td className="py-2">Chat display settings</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            3. Third-Party Cookies
                        </h2>
                        <p className="text-gray-600 dark:text-kick-text-secondary mb-4">
                            When you connect third-party accounts, those services may set their own cookies:
                        </p>
                        <ul className="list-disc pl-6 text-gray-600 dark:text-kick-text-secondary space-y-2">
                            <li><strong>Kick.com:</strong> OAuth authentication cookies during login</li>
                            <li><strong>Discord:</strong> OAuth cookies when connecting your Discord account</li>
                            <li><strong>Telegram:</strong> Authentication data during Telegram connection</li>
                        </ul>
                        <p className="text-gray-600 dark:text-kick-text-secondary mt-4">
                            We do not control third-party cookies. Please refer to their respective privacy policies
                            for more information.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            4. Managing Cookies
                        </h2>
                        <p className="text-gray-600 dark:text-kick-text-secondary mb-4">
                            You can control and manage cookies in several ways:
                        </p>

                        <div className="space-y-4">
                            <div className="bg-gray-50 dark:bg-kick-surface-hover rounded-xl p-4">
                                <h3 className="font-medium text-gray-800 dark:text-kick-text mb-2">Browser Settings</h3>
                                <p className="text-sm text-gray-600 dark:text-kick-text-secondary">
                                    Most browsers allow you to block or delete cookies through their settings.
                                    Note that blocking essential cookies will prevent you from using the Service.
                                </p>
                            </div>

                            <div className="bg-gray-50 dark:bg-kick-surface-hover rounded-xl p-4">
                                <h3 className="font-medium text-gray-800 dark:text-kick-text mb-2">Logout</h3>
                                <p className="text-sm text-gray-600 dark:text-kick-text-secondary">
                                    Logging out of the Service will clear your authentication cookies and local storage data.
                                </p>
                            </div>

                            <div className="bg-gray-50 dark:bg-kick-surface-hover rounded-xl p-4">
                                <h3 className="font-medium text-gray-800 dark:text-kick-text mb-2">Clear Storage</h3>
                                <p className="text-sm text-gray-600 dark:text-kick-text-secondary">
                                    You can clear all site data by using your browser&apos;s &quot;Clear browsing data&quot; feature
                                    or by accessing the developer tools.
                                </p>
                            </div>
                        </div>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            5. Do Not Track
                        </h2>
                        <p className="text-gray-600 dark:text-kick-text-secondary">
                            Some browsers have a &quot;Do Not Track&quot; feature. We currently do not respond to Do Not Track
                            signals as there is no industry standard for compliance. We only use cookies that are
                            necessary for the Service to function.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            6. Updates to This Policy
                        </h2>
                        <p className="text-gray-600 dark:text-kick-text-secondary">
                            We may update this Cookie Policy from time to time to reflect changes in our practices
                            or for other operational, legal, or regulatory reasons. We encourage you to review this
                            policy periodically.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            7. Contact Us
                        </h2>
                        <p className="text-gray-600 dark:text-kick-text-secondary mb-4">
                            If you have questions about our use of cookies, please contact us:
                        </p>
                        <div className="text-gray-600 dark:text-kick-text-secondary space-y-2">
                            <p><strong>Company:</strong> Sweetflips Holdings Limited</p>
                            <p><strong>Registered Address:</strong><br />
                            Capital Business Centre, Entrance A, Floor 1<br />
                            Triq Taz-Zwejt<br />
                            San Gwann, SGN 3000<br />
                            Malta</p>
                            <p><strong>Website:</strong> www.kickdashboard.com</p>
                            <p><strong>Email:</strong> <a href="mailto:info@sweetflips.gg" className="text-kick-green hover:underline">info@sweetflips.gg</a></p>
                            <p className="mt-4">
                                You may also contact us through our official Discord or Telegram channels.
                            </p>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    )
}
