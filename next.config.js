/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'kick.com',
      },
      {
        protocol: 'https',
        hostname: '**.kick.com',
      },
      {
        protocol: 'https',
        hostname: 'files.kick.com',
      },
      {
        protocol: 'https',
        hostname: '**.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: '**.cloudfront.net',
      },
      // Supabase Storage
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },
}

module.exports = nextConfig
