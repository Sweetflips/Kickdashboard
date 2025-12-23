import { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Privacy Policy | SweetFlips',
    description: 'Privacy Policy for SweetFlips - How we collect, use, and protect your data',
}

export default function PrivacyPolicy() {
    return (
        <div className="max-w-4xl mx-auto px-4 py-12">
            <div className="bg-white dark:bg-kick-surface rounded-2xl shadow-sm border border-gray-200 dark:border-kick-border p-8 md:p-12">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-kick-text mb-2">
                    Privacy Policy
                </h1>
                <p className="text-sm text-gray-500 dark:text-kick-text-secondary mb-8">
                    Last updated: December 20, 2024
                </p>

                <div className="prose prose-gray dark:prose-invert max-w-none">
                    <section className="mb-8">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            1. Introduction
                        </h2>
                        <p className="text-gray-600 dark:text-kick-text-secondary">
                            Sweetflips Holdings Limited ("we," "our," or "us"), a company registered in Malta, is committed to protecting your privacy. This Privacy
                            Policy explains how we collect, use, disclose, and safeguard your information when you
                            use our Service available at www.kickdashboard.com. Please read this policy carefully to understand our views and practices
                            regarding your personal data.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            2. Information We Collect
                        </h2>

                        <h3 className="text-lg font-medium text-gray-800 dark:text-kick-text mb-3">
                            2.1 Information from Kick.com
                        </h3>
                        <p className="text-gray-600 dark:text-kick-text-secondary mb-4">
                            When you authenticate with your Kick account, we receive:
                        </p>
                        <ul className="list-disc pl-6 text-gray-600 dark:text-kick-text-secondary space-y-2 mb-6">
                            <li>Your Kick user ID and username</li>
                            <li>Profile picture URL</li>
                            <li>Email address (if authorized)</li>
                            <li>Account creation date</li>
                            <li>Subscriber and VIP status</li>
                        </ul>

                        <h3 className="text-lg font-medium text-gray-800 dark:text-kick-text mb-3">
                            2.2 Connected Accounts (Optional)
                        </h3>
                        <p className="text-gray-600 dark:text-kick-text-secondary mb-4">
                            If you choose to connect additional accounts:
                        </p>
                        <ul className="list-disc pl-6 text-gray-600 dark:text-kick-text-secondary space-y-2 mb-6">
                            <li><strong>Discord:</strong> User ID, username, discriminator, and avatar</li>
                            <li><strong>Telegram:</strong> User ID, username, and first/last name</li>
                        </ul>

                        <h3 className="text-lg font-medium text-gray-800 dark:text-kick-text mb-3">
                            2.3 Activity Data
                        </h3>
                        <p className="text-gray-600 dark:text-kick-text-secondary mb-4">
                            We collect data about your use of the Service:
                        </p>
                        <ul className="list-disc pl-6 text-gray-600 dark:text-kick-text-secondary space-y-2 mb-6">
                            <li>Chat messages sent during streams (content and timestamps)</li>
                            <li>Sweet Coins earned and spent</li>
                            <li>Raffle entries and results</li>
                            <li>Stream viewing activity</li>
                            <li>Feature usage and preferences</li>
                        </ul>

                        <h3 className="text-lg font-medium text-gray-800 dark:text-kick-text mb-3">
                            2.4 Technical Data
                        </h3>
                        <p className="text-gray-600 dark:text-kick-text-secondary mb-4">
                            We automatically collect:
                        </p>
                        <ul className="list-disc pl-6 text-gray-600 dark:text-kick-text-secondary space-y-2">
                            <li>IP address (for security and abuse prevention)</li>
                            <li>Browser type and version</li>
                            <li>Device information</li>
                            <li>Access times and dates</li>
                        </ul>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            3. How We Use Your Information
                        </h2>
                        <p className="text-gray-600 dark:text-kick-text-secondary mb-4">
                            We use collected information to:
                        </p>
                        <ul className="list-disc pl-6 text-gray-600 dark:text-kick-text-secondary space-y-2">
                            <li>Provide, maintain, and improve the Service</li>
                            <li>Track and award points for community participation</li>
                            <li>Operate raffles and giveaways</li>
                            <li>Display leaderboards and analytics</li>
                            <li>Contact winners about prizes</li>
                            <li>Prevent fraud, abuse, and enforce our Terms of Service</li>
                            <li>Respond to your inquiries and provide support</li>
                            <li>Generate anonymized analytics about Service usage</li>
                        </ul>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            4. Data Sharing and Disclosure
                        </h2>
                        <p className="text-gray-600 dark:text-kick-text-secondary mb-4">
                            We may share your information in the following circumstances:
                        </p>
                        <ul className="list-disc pl-6 text-gray-600 dark:text-kick-text-secondary space-y-2">
                            <li><strong>Public Display:</strong> Usernames, points, and rankings may be displayed publicly on leaderboards</li>
                            <li><strong>Stream Integration:</strong> Your chat activity may be visible to streamers and moderators</li>
                            <li><strong>Service Providers:</strong> We use third-party services (hosting, analytics) that process data on our behalf</li>
                            <li><strong>Legal Requirements:</strong> We may disclose data if required by law or to protect our rights</li>
                            <li><strong>Business Transfers:</strong> In the event of a merger or acquisition, user data may be transferred</li>
                        </ul>
                        <p className="text-gray-600 dark:text-kick-text-secondary mt-4">
                            We do not sell your personal information to third parties.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            5. Data Security
                        </h2>
                        <p className="text-gray-600 dark:text-kick-text-secondary mb-4">
                            We implement appropriate security measures to protect your data:
                        </p>
                        <ul className="list-disc pl-6 text-gray-600 dark:text-kick-text-secondary space-y-2">
                            <li>Encrypted data transmission (HTTPS/TLS)</li>
                            <li>Secure storage of authentication tokens</li>
                            <li>Regular security audits and updates</li>
                            <li>Access controls for administrative functions</li>
                        </ul>
                        <p className="text-gray-600 dark:text-kick-text-secondary mt-4">
                            However, no method of transmission over the Internet is 100% secure. We cannot guarantee
                            absolute security of your data.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            6. Data Retention
                        </h2>
                        <p className="text-gray-600 dark:text-kick-text-secondary mb-4">
                            We retain your data for as long as your account is active or as needed to provide the Service:
                        </p>
                        <ul className="list-disc pl-6 text-gray-600 dark:text-kick-text-secondary space-y-2">
                            <li>Account data is retained until you request deletion</li>
                            <li>Chat messages may be retained for analytics and moderation purposes</li>
                            <li>Sweet Coins and transaction history are retained for record-keeping</li>
                            <li>Technical logs are typically retained for 90 days</li>
                        </ul>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            7. Your Rights and Choices
                        </h2>
                        <p className="text-gray-600 dark:text-kick-text-secondary mb-4">
                            You have the following rights regarding your data:
                        </p>
                        <ul className="list-disc pl-6 text-gray-600 dark:text-kick-text-secondary space-y-2">
                            <li><strong>Access:</strong> Request a copy of the data we hold about you</li>
                            <li><strong>Correction:</strong> Update or correct inaccurate information</li>
                            <li><strong>Deletion:</strong> Request deletion of your account and associated data</li>
                            <li><strong>Disconnect:</strong> Remove connected accounts (Discord, Telegram, Facebook) at any time</li>
                            <li><strong>Opt-out:</strong> Adjust notification preferences in your settings</li>
                        </ul>
                        <p className="text-gray-600 dark:text-kick-text-secondary mt-4">
                            To exercise these rights, please contact us through our official channels.
                        </p>
                    </section>

                    <section id="data-deletion" className="mb-8 p-6 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4 flex items-center gap-2">
                            <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            8. How to Delete Your Data
                        </h2>
                        <p className="text-gray-600 dark:text-kick-text-secondary mb-4">
                            You have the right to request deletion of all personal data we have collected about you.
                            When you request data deletion, we will permanently remove:
                        </p>
                        <ul className="list-disc pl-6 text-gray-600 dark:text-kick-text-secondary space-y-2 mb-6">
                            <li>Your account profile and authentication data</li>
                            <li>Connected social accounts (Facebook, Discord, Telegram)</li>
                            <li>Sweet Coins balance and transaction history</li>
                            <li>Raffle entries and participation history</li>
                            <li>Chat messages and activity logs</li>
                            <li>Any stored preferences and settings</li>
                        </ul>

                        <h3 className="text-lg font-medium text-gray-800 dark:text-kick-text mb-3">
                            To Request Data Deletion:
                        </h3>
                        <ol className="list-decimal pl-6 text-gray-600 dark:text-kick-text-secondary space-y-3 mb-6">
                            <li>
                                <strong>Email us directly:</strong> Send a deletion request through our official Discord or Telegram channels
                                with the subject line "Data Deletion Request"
                            </li>
                            <li>
                                <strong>Include your account information:</strong> Provide the email address or username associated with your account so we can locate your data
                            </li>
                            <li>
                                <strong>Verification:</strong> We may need to verify your identity to process the request
                            </li>
                        </ol>

                        <div className="bg-white dark:bg-kick-surface rounded-lg p-4 border border-red-200 dark:border-red-800">
                            <p className="text-sm text-gray-600 dark:text-kick-text-secondary">
                                <strong className="text-gray-900 dark:text-kick-text">Processing Time:</strong>{' '}
                                We will process your deletion request within 30 days. You will receive a confirmation email once your data has been deleted.
                                Please note that some data may be retained for legal or regulatory compliance purposes as required by law.
                            </p>
                        </div>

                        <p className="text-sm text-gray-500 dark:text-kick-text-secondary mt-4">
                            If you connected your Facebook account, you can also manage your data through{' '}
                            <a href="https://www.facebook.com/settings?tab=applications" target="_blank" rel="noopener noreferrer" className="text-kick-green hover:underline">
                                Facebook's App Settings
                            </a>.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            9. Third-Party Services
                        </h2>
                        <p className="text-gray-600 dark:text-kick-text-secondary mb-4">
                            Our Service integrates with third-party platforms:
                        </p>
                        <ul className="list-disc pl-6 text-gray-600 dark:text-kick-text-secondary space-y-2">
                            <li><strong>Kick.com:</strong> Primary authentication and chat integration</li>
                            <li><strong>Facebook:</strong> Optional account connection for login and social features</li>
                            <li><strong>Discord:</strong> Optional account connection for notifications</li>
                            <li><strong>Telegram:</strong> Optional account connection for notifications</li>
                        </ul>
                        <p className="text-gray-600 dark:text-kick-text-secondary mt-4">
                            Each of these services has its own privacy policy. We encourage you to review them.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            10. International Data Transfers
                        </h2>
                        <p className="text-gray-600 dark:text-kick-text-secondary">
                            Your data may be transferred to and processed in countries other than your own.
                            We ensure appropriate safeguards are in place for such transfers in compliance with
                            applicable data protection laws, including the General Data Protection Regulation (GDPR) and Maltese data protection legislation.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            11. Children's Privacy
                        </h2>
                        <p className="text-gray-600 dark:text-kick-text-secondary">
                            The Service is not intended for users under 18 years of age. We do not knowingly collect
                            personal information from children. If you believe we have collected data from a minor,
                            please contact us immediately.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            12. Changes to This Policy
                        </h2>
                        <p className="text-gray-600 dark:text-kick-text-secondary">
                            We may update this Privacy Policy from time to time. We will notify you of significant
                            changes by posting a notice on the Service. Your continued use after such changes
                            constitutes acceptance of the updated policy.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            13. Contact Us
                        </h2>
                        <p className="text-gray-600 dark:text-kick-text-secondary mb-4">
                            If you have questions about this Privacy Policy or wish to exercise your data rights, please contact us:
                        </p>
                        <div className="text-gray-600 dark:text-kick-text-secondary space-y-2">
                            <p><strong>Company:</strong> Sweetflips Holdings Limited</p>
                            <p><strong>Registered Address:</strong><br />
                            Capital Business Centre, Entrance A, Floor 1<br />
                            Triq Taz-Zwejt<br />
                            San Gwann, SGN 3000<br />
                            Malta</p>
                            <p><strong>Website:</strong> www.kickdashboard.com</p>
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
