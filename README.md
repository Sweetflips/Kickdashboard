# SweetFlips Rewards

A Kick streaming rewards and analytics platform built with Next.js, Prisma, and PostgreSQL.

## Features

- 🎮 Real-time chat integration with Kick
- 📊 Comprehensive analytics and leaderboards
- 🏆 Points system for viewer engagement
- 😀 Emote tracking and statistics
- 📈 Stream-specific analytics
- 🔐 OAuth authentication with Kick
- 🌙 Dark/Light mode support

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: PostgreSQL with Prisma ORM
- **Styling**: Tailwind CSS
- **Real-time**: Pusher (for chat)
- **Deployment**: Railway

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database
- Kick OAuth credentials

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd kick-chat
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

Edit `.env.local` with your configuration:
- `DATABASE_URL` - PostgreSQL connection string
- `KICK_CLIENT_ID` - Your Kick OAuth client ID
- `KICK_CLIENT_SECRET` - Your Kick OAuth client secret
- `NEXT_PUBLIC_APP_URL` - Your application URL

4. Set up the database:
```bash
npx prisma migrate deploy
npx prisma generate
```

5. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Deployment

See [RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md) for detailed Railway deployment instructions.

### Quick Railway Deploy

1. Connect your GitHub repository to Railway
2. Add PostgreSQL database service
3. Set environment variables in Railway dashboard
4. Deploy!

## Environment Variables

See `.env.example` for all available environment variables.

### Required
- `DATABASE_URL` - PostgreSQL connection string
- `KICK_CLIENT_ID` - Kick OAuth client ID
- `KICK_CLIENT_SECRET` - Kick OAuth client secret
- `NEXT_PUBLIC_APP_URL` - Application URL (e.g., `https://kickdashboard.com`)

### Optional
- `EXTERNAL_WEBHOOK_URL` - External webhook forwarding URL
- `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` - Discord OAuth
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_BOT_USERNAME` - Telegram bot
- Pusher credentials for real-time features

## Project Structure

```
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   ├── analytics/         # Analytics pages
│   ├── chat/              # Chat interface
│   └── streams/           # Stream management
├── components/            # React components
├── lib/                   # Utility functions
├── prisma/                # Prisma schema and migrations
└── public/                # Static assets
```

## Database Migrations

After setting up your database, run migrations:

```bash
npx prisma migrate deploy
```

To create a new migration:

```bash
npx prisma migrate dev --name your_migration_name
```

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint

## License

Private project - All rights reserved
