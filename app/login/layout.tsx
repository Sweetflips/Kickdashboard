import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sign In',
  description: 'Sign in to SweetFlips with your Kick account. Earn money by watching streams, join raffles, win prizes, and climb the leaderboard!',
  openGraph: {
    title: 'Sign In | SweetFlips',
    description: 'Sign in to SweetFlips with your Kick account. Earn money by watching streams, join raffles, and win prizes!',
  },
}

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
