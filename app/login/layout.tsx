import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sign In',
  description: 'Sign in to SweetFlips Dashboard with your Kick account. Earn points, join raffles, track your stats, and compete on the leaderboard.',
  openGraph: {
    title: 'Sign In | SweetFlips Dashboard',
    description: 'Sign in to SweetFlips Dashboard with your Kick account. Earn points, join raffles, and compete on the leaderboard.',
  },
}

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}

