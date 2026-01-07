import { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
    title: 'Data Deletion | SweetFlips',
    description: 'Request deletion of your personal data from SweetFlips',
}

export default function DataDeletion() {
    return (
        <div className="max-w-4xl mx-auto px-4 py-12">
            <div className="bg-white dark:bg-kick-surface rounded-2xl shadow-sm border border-gray-200 dark:border-kick-border p-8 md:p-12">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                        <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-kick-text">
                        Data Deletion Request
                    </h1>
                </div>
                <p className="text-sm text-gray-500 dark:text-kick-text-secondary mb-8">
                    Request removal of your personal data from SweetFlips
                </p>

                <div className="prose prose-gray dark:prose-invert max-w-none">
                    <section className="mb-8">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            Your Right to Data Deletion
                        </h2>
                        <p className="text-gray-600 dark:text-kick-text-secondary">
                            You have the right to request the deletion of all personal data we have collected about you.
                            We are committed to protecting your privacy and will process your request in accordance with
                            applicable data protection laws including GDPR, CCPA, and other relevant regulations.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            What Data Will Be Deleted
                        </h2>
                        <p className="text-gray-600 dark:text-kick-text-secondary mb-4">
                            When you request data deletion, we will permanently remove:
                        </p>
                        <ul className="list-disc pl-6 text-gray-600 dark:text-kick-text-secondary space-y-2">
                            <li>Your account profile and authentication credentials</li>
                            <li>Connected social accounts (Facebook, Discord, Telegram, Kick)</li>
                            <li>Sweet Coins balance and transaction history</li>
                            <li>Raffle entries and participation records</li>
                            <li>Chat messages and activity logs</li>
                            <li>Preferences, settings, and notification configurations</li>
                            <li>Any uploaded content or profile media</li>
                        </ul>
                    </section>

                    <section className="mb-8 p-6 bg-kick-green/10 dark:bg-kick-green/20 rounded-xl border border-kick-green/30">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            How to Request Data Deletion
                        </h2>

                        <div className="space-y-4">
                            <div className="flex gap-4">
                                <div className="flex-shrink-0 w-8 h-8 bg-kick-green text-white rounded-full flex items-center justify-center font-bold text-sm">
                                    1
                                </div>
                                <div>
                                    <h3 className="font-medium text-gray-900 dark:text-kick-text mb-1">
                                        Send an Email
                                    </h3>
                                    <p className="text-gray-600 dark:text-kick-text-secondary">
                                        Email us at{' '}
                                        <a href="mailto:privacy@sweetflipsoftware.com" className="text-kick-green hover:underline font-medium">
                                            privacy@sweetflipsoftware.com
                                        </a>{' '}
                                        with the subject line <strong>&quot;Data Deletion Request&quot;</strong>
                                    </p>
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <div className="flex-shrink-0 w-8 h-8 bg-kick-green text-white rounded-full flex items-center justify-center font-bold text-sm">
                                    2
                                </div>
                                <div>
                                    <h3 className="font-medium text-gray-900 dark:text-kick-text mb-1">
                                        Include Account Information
                                    </h3>
                                    <p className="text-gray-600 dark:text-kick-text-secondary">
                                        Provide the email address or username associated with your SweetFlips account
                                        so we can locate and verify your data.
                                    </p>
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <div className="flex-shrink-0 w-8 h-8 bg-kick-green text-white rounded-full flex items-center justify-center font-bold text-sm">
                                    3
                                </div>
                                <div>
                                    <h3 className="font-medium text-gray-900 dark:text-kick-text mb-1">
                                        Identity Verification
                                    </h3>
                                    <p className="text-gray-600 dark:text-kick-text-secondary">
                                        We may ask you to verify your identity to ensure the request is legitimate
                                        and protect against unauthorized deletion.
                                    </p>
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <div className="flex-shrink-0 w-8 h-8 bg-kick-green text-white rounded-full flex items-center justify-center font-bold text-sm">
                                    4
                                </div>
                                <div>
                                    <h3 className="font-medium text-gray-900 dark:text-kick-text mb-1">
                                        Confirmation
                                    </h3>
                                    <p className="text-gray-600 dark:text-kick-text-secondary">
                                        You will receive an email confirmation once your data has been permanently deleted.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            Processing Time
                        </h2>
                        <div className="bg-gray-50 dark:bg-kick-surface-hover rounded-lg p-4 border border-gray-200 dark:border-kick-border">
                            <p className="text-gray-600 dark:text-kick-text-secondary">
                                We will process your deletion request within <strong className="text-gray-900 dark:text-kick-text">30 days</strong> of receiving a verified request.
                                In some cases, we may need additional time for complex requests, but we will keep you informed of any delays.
                            </p>
                        </div>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            Data Retention Exceptions
                        </h2>
                        <p className="text-gray-600 dark:text-kick-text-secondary mb-4">
                            Certain data may be retained even after a deletion request in the following circumstances:
                        </p>
                        <ul className="list-disc pl-6 text-gray-600 dark:text-kick-text-secondary space-y-2">
                            <li>Legal or regulatory compliance requirements</li>
                            <li>Fraud prevention and security purposes</li>
                            <li>Resolving disputes or enforcing agreements</li>
                            <li>Anonymized or aggregated data that cannot identify you</li>
                        </ul>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            Facebook Users
                        </h2>
                        <p className="text-gray-600 dark:text-kick-text-secondary mb-4">
                            If you connected your Facebook account to SweetFlips, you can also manage your data connection through Facebook:
                        </p>
                        <ol className="list-decimal pl-6 text-gray-600 dark:text-kick-text-secondary space-y-2 mb-4">
                            <li>Go to your <a href="https://www.facebook.com/settings?tab=applications" target="_blank" rel="noopener noreferrer" className="text-kick-green hover:underline">Facebook App Settings</a></li>
                            <li>Find &quot;Kickdashboard&quot; in your connected apps</li>
                            <li>Click &quot;Remove&quot; to revoke access</li>
                        </ol>
                        <p className="text-gray-600 dark:text-kick-text-secondary">
                            Note: Removing the app from Facebook will disconnect your account but may not delete all data stored on our servers.
                            For complete data deletion, please also submit a request via email as described above.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            Contact Us
                        </h2>
                        <p className="text-gray-600 dark:text-kick-text-secondary mb-4">
                            If you have questions about data deletion or your privacy rights, please contact us:
                        </p>
                        <div className="bg-gray-50 dark:bg-kick-surface-hover rounded-lg p-4 border border-gray-200 dark:border-kick-border">
                            <p className="text-gray-600 dark:text-kick-text-secondary">
                                <strong className="text-gray-900 dark:text-kick-text">Email:</strong>{' '}
                                <a href="mailto:privacy@sweetflipsoftware.com" className="text-kick-green hover:underline">
                                    privacy@sweetflipsoftware.com
                                </a>
                            </p>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-kick-text-secondary mt-4">
                            For more information about how we handle your data, please read our{' '}
                            <Link href="/legal/privacy" className="text-kick-green hover:underline">
                                Privacy Policy
                            </Link>.
                        </p>
                    </section>
                </div>
            </div>
        </div>
    )
}
