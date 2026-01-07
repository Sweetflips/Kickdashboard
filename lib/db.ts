import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Singleton pattern - reuse existing client or create new one
export const db: PrismaClient =
  globalForPrisma.prisma ??
  (globalForPrisma.prisma = new PrismaClient({
    log: [],
    transactionOptions: {
      maxWait: 5000,
      timeout: 15000,
    },
  }))

export default db
