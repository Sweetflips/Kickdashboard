import { PrismaClient } from '@prisma/client'
import { withAccelerate } from '@prisma/extension-accelerate'

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createClient> | undefined
}

function createClient() {
  return new PrismaClient({
    log: [],
    transactionOptions: {
      maxWait: 5000,
      timeout: 15000,
    },
  }).$extends(withAccelerate())
}

export const db = globalForPrisma.prisma ?? (globalForPrisma.prisma = createClient())
export default db
