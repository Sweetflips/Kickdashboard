import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/ThemeProvider'
import { ToastContainer } from '@/components/Toast'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  weight: ['300', '400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: {
    default: 'SweetFlips | Earn Rewards Watching Kick Streams',
    template: '%s | SweetFlips',
  },
  description: 'Earn money by watching SweetFlips stream on Kick! Chat to collect points, enter raffles, win prizes, and climb the leaderboard. Join the SweetFlips community today.',
  keywords: ['SweetFlips', 'Kick', 'streaming', 'rewards', 'points', 'raffles', 'leaderboard', 'gambling', 'slots', 'community', 'earn money', 'kick.com'],
  authors: [{ name: 'SweetFlips' }],
  creator: 'SweetFlips',
  publisher: 'SweetFlips',
  metadataBase: new URL('https://www.kickdashboard.com'),
  alternates: {
    canonical: '/',
  },
  icons: {
    icon: [
      { url: '/icon.png', type: 'image/png', sizes: '192x192' },
    ],
    apple: { url: '/icon.png', sizes: '180x180' },
    shortcut: '/icon.png',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://www.kickdashboard.com',
    siteName: 'SweetFlips',
    title: 'SweetFlips | Earn Rewards Watching Kick Streams',
    description: 'Earn money by watching SweetFlips stream on Kick! Chat to collect points, enter raffles, win prizes, and climb the leaderboard.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'SweetFlips - Earn Rewards on Kick',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SweetFlips | Earn Rewards Watching Kick Streams',
    description: 'Earn money by watching SweetFlips stream on Kick! Chat to collect points, enter raffles, win prizes, and climb the leaderboard.',
    images: ['/og-image.png'],
    creator: '@sweetflips',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.variable}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
          <ToastContainer />
        </ThemeProvider>
      </body>
    </html>
  )
}
