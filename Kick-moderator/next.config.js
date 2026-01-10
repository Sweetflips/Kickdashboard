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
    ],
  },
  // Disable ESLint blocking production builds. We still keep ESLint configured
  // so that "next lint" can be run manually during development.
  eslint: {
    ignoreDuringBuilds: true,
  },
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'kickdashboard.com' }],
        destination: 'https://www.kickdashboard.com/:path*',
        permanent: true,
      },
    ]
  },
  // Enable standalone output for Docker
  output: 'standalone',
}

module.exports = nextConfig
