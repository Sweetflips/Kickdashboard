import { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Terms of Service | SweetFlips',
    description: 'Terms of Service for SweetFlips - Kick rewards and analytics platform',
}

export default function TermsOfService() {
    return (
        <div className="max-w-4xl mx-auto px-4 py-12">
            <div className="bg-white dark:bg-kick-surface rounded-2xl shadow-sm border border-gray-200 dark:border-kick-border p-8 md:p-12">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-kick-text mb-2">
                    Terms of Service
                </h1>
                <p className="text-sm text-gray-500 dark:text-kick-text-secondary mb-8">
                    Last updated: December 7, 2024
                </p>

                <div className="prose prose-gray dark:prose-invert max-w-none">
                    <section className="mb-8">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            1. Acceptance of Terms
                        </h2>
                        <p className="text-gray-600 dark:text-kick-text-secondary mb-4">
                            By accessing or using SweetFlips ("the Service"), you agree to be bound by these Terms of Service.
                            If you do not agree to these terms, please do not use the Service.
                        </p>
                        <p className="text-gray-600 dark:text-kick-text-secondary">
                            The Service is provided as a companion platform for Kick.com streamers and their communities.
                            It is not affiliated with, endorsed by, or sponsored by Kick.com.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            2. Eligibility
                        </h2>
                        <p className="text-gray-600 dark:text-kick-text-secondary mb-4">
                            You must be at least 18 years old to use this Service. By using the Service, you represent
                            and warrant that you meet this age requirement and have the legal capacity to enter into
                            these Terms.
                        </p>
                        <p className="text-gray-600 dark:text-kick-text-secondary">
                            Users must have a valid Kick.com account to access the Service. Your use of the Service
                            is also subject to Kick.com's Terms of Service.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            3. Account and Authentication
                        </h2>
                        <p className="text-gray-600 dark:text-kick-text-secondary mb-4">
                            The Service uses OAuth authentication through Kick.com. You are responsible for maintaining
                            the security of your Kick account credentials. We do not store your Kick password.
                        </p>
                        <p className="text-gray-600 dark:text-kick-text-secondary">
                            You may also optionally connect Discord and Telegram accounts. These connections are voluntary
                            and can be disconnected at any time through your profile settings.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            4. Sweet Coins and Rewards System
                        </h2>
                        <p className="text-gray-600 dark:text-kick-text-secondary mb-4">
                            The Service offers a Sweet Coins system where users can earn Sweet Coins through various activities
                            such as watching streams and participating in chat. Sweet Coins have no monetary value and
                            cannot be exchanged for real currency.
                        </p>
                        <ul className="list-disc pl-6 text-gray-600 dark:text-kick-text-secondary space-y-2 mb-4">
                            <li>Sweet Coins are virtual rewards for community engagement only</li>
                            <li>Sweet Coins cannot be transferred between accounts</li>
                            <li>We reserve the right to adjust Sweet Coin balances to correct errors or abuse</li>
                            <li>Sweet Coins may expire or be reset at our discretion with reasonable notice</li>
                        </ul>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            5. Raffles and Giveaways
                        </h2>
                        <p className="text-gray-600 dark:text-kick-text-secondary mb-4">
                            The Service may offer raffles and giveaways where users can use Sweet Coins to purchase entries.
                            By participating:
                        </p>
                        <ul className="list-disc pl-6 text-gray-600 dark:text-kick-text-secondary space-y-2 mb-4">
                            <li>You acknowledge that winning is based on random selection</li>
                            <li>All entries are final and Sweet Coins spent are non-refundable</li>
                            <li>Winners are responsible for any taxes on prizes in their jurisdiction</li>
                            <li>Prize fulfillment is subject to winner verification and eligibility</li>
                            <li>We reserve the right to disqualify entries that violate these terms</li>
                        </ul>
                        <p className="text-gray-600 dark:text-kick-text-secondary">
                            Raffles are for entertainment purposes only and do not constitute gambling as no real
                            money is wagered. Sweet Coins are earned through participation, not purchased.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            6. Prohibited Conduct
                        </h2>
                        <p className="text-gray-600 dark:text-kick-text-secondary mb-4">
                            You agree not to:
                        </p>
                        <ul className="list-disc pl-6 text-gray-600 dark:text-kick-text-secondary space-y-2">
                            <li>Use bots, scripts, or automated tools to earn points or interact with the Service</li>
                            <li>Create multiple accounts to abuse the points or raffle systems</li>
                            <li>Attempt to exploit bugs or vulnerabilities in the Service</li>
                            <li>Harass, abuse, or threaten other users</li>
                            <li>Impersonate others or misrepresent your identity</li>
                            <li>Violate any applicable laws or Kick.com's Terms of Service</li>
                            <li>Share, sell, or transfer your account</li>
                        </ul>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            7. Intellectual Property
                        </h2>
                        <p className="text-gray-600 dark:text-kick-text-secondary">
                            All content, features, and functionality of the Service are owned by SweetFlips and are
                            protected by intellectual property laws. You may not copy, modify, distribute, or create
                            derivative works without our express written permission.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            8. Disclaimer of Warranties
                        </h2>
                        <p className="text-gray-600 dark:text-kick-text-secondary mb-4">
                            THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND,
                            EITHER EXPRESS OR IMPLIED. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED,
                            ERROR-FREE, OR SECURE.
                        </p>
                        <p className="text-gray-600 dark:text-kick-text-secondary">
                            We are not responsible for the availability or functionality of Kick.com or any
                            third-party services integrated with the Service.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            9. Limitation of Liability
                        </h2>
                        <p className="text-gray-600 dark:text-kick-text-secondary">
                            TO THE MAXIMUM EXTENT PERMITTED BY LAW, SWEETFLIPS SHALL NOT BE LIABLE FOR ANY INDIRECT,
                            INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF THE SERVICE.
                            OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT YOU PAID TO USE THE SERVICE (IF ANY) IN THE
                            12 MONTHS PRECEDING THE CLAIM.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            10. Account Termination
                        </h2>
                        <p className="text-gray-600 dark:text-kick-text-secondary">
                            We may suspend or terminate your access to the Service at any time for violation of these
                            Terms or for any other reason at our sole discretion. Upon termination, your right to use
                            the Service will immediately cease, and any accumulated points may be forfeited.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            11. Changes to Terms
                        </h2>
                        <p className="text-gray-600 dark:text-kick-text-secondary">
                            We reserve the right to modify these Terms at any time. We will notify users of material
                            changes through the Service. Your continued use of the Service after such changes
                            constitutes acceptance of the new Terms.
                        </p>
                    </section>

                    <section className="mb-8">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            12. Governing Law
                        </h2>
                        <p className="text-gray-600 dark:text-kick-text-secondary">
                            These Terms shall be governed by and construed in accordance with the laws of the
                            jurisdiction where SweetFlips operates, without regard to its conflict of law provisions.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-kick-text mb-4">
                            13. Contact Information
                        </h2>
                        <p className="text-gray-600 dark:text-kick-text-secondary">
                            If you have any questions about these Terms, please contact us through our official
                            Discord or Telegram channels, or reach out to the stream directly.
                        </p>
                    </section>
                </div>
            </div>
        </div>
    )
}
