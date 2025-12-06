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
    default: 'SweetFlips Dashboard | Kick Rewards & Analytics',
    template: '%s | SweetFlips',
  },
  description: 'Earn points by chatting during SweetFlips streams on Kick. Join raffles, complete achievements, and climb the leaderboard. The official rewards dashboard for the SweetFlips community.',
  keywords: ['SweetFlips', 'Kick', 'streaming', 'rewards', 'points', 'raffles', 'leaderboard', 'gambling', 'slots', 'community'],
  authors: [{ name: 'SweetFlips' }],
  creator: 'SweetFlips',
  publisher: 'SweetFlips',
  metadataBase: new URL('https://www.kickdashboard.com'),
  alternates: {
    canonical: '/',
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/8 EMERALD (1).png', type: 'image/png' },
    ],
    apple: '/8 EMERALD (1).png',
    shortcut: '/8 EMERALD (1).png',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://www.kickdashboard.com',
    siteName: 'SweetFlips Dashboard',
    title: 'SweetFlips Dashboard | Kick Rewards & Analytics',
    description: 'Earn points by chatting during SweetFlips streams on Kick. Join raffles, complete achievements, and climb the leaderboard.',
    images: [
      {
        url: '/sweet_flips (2).png',
        width: 1200,
        height: 630,
        alt: 'SweetFlips Dashboard',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SweetFlips Dashboard | Kick Rewards & Analytics',
    description: 'Earn points by chatting during SweetFlips streams on Kick. Join raffles, complete achievements, and climb the leaderboard.',
    images: ['/sweet_flips (2).png'],
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
