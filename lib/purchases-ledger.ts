import { ADVENT_ITEMS } from '@/lib/advent-calendar'

type TxLike = {
  $queryRaw: any
  $executeRaw: any
  adventPurchase: any
  raffleEntry: any
}

export async function ensurePurchaseTransactionsTable(tx: TxLike) {
  // Repo ignores prisma/migrations/, so we need to be resilient in environments
  // where the table hasn't been created yet.
  await tx.$executeRaw`
    CREATE TABLE IF NOT EXISTS "purchase_transactions" (
      "id" BIGSERIAL PRIMARY KEY,
      "user_id" BIGINT NOT NULL,
      "type" TEXT NOT NULL,
      "quantity" INTEGER NOT NULL,
      "points_spent" INTEGER NOT NULL,
      "item_name" TEXT NOT NULL,
      "advent_item_id" TEXT,
      "raffle_id" BIGINT,
      "metadata" JSONB,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `

  // FK is optional (older DBs / order-of-creation). We'll attempt it, ignore if it fails.
  try {
    await tx.$executeRaw`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'purchase_transactions_user_id_fkey'
        ) THEN
          ALTER TABLE "purchase_transactions"
          ADD CONSTRAINT "purchase_transactions_user_id_fkey"
          FOREIGN KEY ("user_id") REFERENCES "users"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
    `
  } catch {
    // ignore
  }

  // Indexes (idempotent)
  await tx.$executeRaw`CREATE INDEX IF NOT EXISTS "purchase_transactions_user_id_created_at_idx" ON "purchase_transactions" ("user_id", "created_at");`
  await tx.$executeRaw`CREATE INDEX IF NOT EXISTS "purchase_transactions_type_created_at_idx" ON "purchase_transactions" ("type", "created_at");`
  await tx.$executeRaw`CREATE INDEX IF NOT EXISTS "purchase_transactions_raffle_id_idx" ON "purchase_transactions" ("raffle_id");`
  await tx.$executeRaw`CREATE INDEX IF NOT EXISTS "purchase_transactions_advent_item_id_idx" ON "purchase_transactions" ("advent_item_id");`
}

/**
 * One-time backfill: if a user has NO rows in purchase_transactions yet,
 * snapshot their current aggregate ownership tables (advent_purchases, raffle_entries)
 * into purchase_transactions as legacy rows. This prevents double-counting and
 * gives users history immediately after the ledger ships.
 */
export async function backfillPurchaseTransactionsIfEmpty(tx: TxLike, userId: bigint) {
  await ensurePurchaseTransactionsTable(tx)

  const existing = await tx.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS(
      SELECT 1 FROM purchase_transactions WHERE user_id = ${userId} LIMIT 1
    ) AS "exists"
  `

  if (existing?.[0]?.exists) return

  await backfillMissingPurchaseTransactions(tx, userId)
}

/**
 * Backfill "legacy" rows to cover any difference between aggregate ownership tables
 * (advent_purchases / raffle_entries) and already-recorded ledger rows.
 *
 * Safe to call repeatedly: it only inserts rows for remaining quantities > 0.
 */
export async function backfillMissingPurchaseTransactions(tx: TxLike, userId: bigint) {
  await ensurePurchaseTransactionsTable(tx)

  // Advent legacy snapshot
  const advent = await tx.adventPurchase.findMany({
    where: { user_id: userId },
    select: { item_id: true, tickets: true, created_at: true },
  })

  const adventSums = await tx.$queryRaw<Array<{ advent_item_id: string; qty: bigint | number | null }>>`
    SELECT advent_item_id, COALESCE(SUM(quantity), 0) AS qty
    FROM purchase_transactions
    WHERE user_id = ${userId}
      AND type = ${'advent_ticket'}
      AND advent_item_id IS NOT NULL
    GROUP BY advent_item_id
  `
  const adventById = new Map<string, number>(
    (adventSums || []).map(r => [r.advent_item_id, typeof r.qty === 'bigint' ? Number(r.qty) : Number(r.qty || 0)])
  )

  for (const p of advent) {
    const item = ADVENT_ITEMS.find(i => i.id === p.item_id)
    const already = adventById.get(p.item_id) || 0
    const remaining = Math.max(0, p.tickets - already)
    if (remaining <= 0) continue

    const pointsSpent = item ? item.pointsCost * remaining : 0
    const itemName = item ? `Day ${item.day} – Advent Ticket` : `Advent Ticket – ${p.item_id}`
    const metadata = { legacy: true, source: 'advent_purchases' }

    await tx.$executeRaw`
      INSERT INTO purchase_transactions (
        user_id, type, quantity, points_spent, item_name, advent_item_id, raffle_id, metadata, created_at
      )
      VALUES (
        ${userId}, ${'advent_ticket'}, ${remaining}, ${pointsSpent}, ${itemName}, ${p.item_id}, NULL, ${metadata as any}, ${p.created_at}
      )
    `
  }

  // Raffle legacy snapshot
  const raffles = await tx.raffleEntry.findMany({
    where: { user_id: userId },
    select: {
      raffle_id: true,
      tickets: true,
      created_at: true,
      raffle: {
        select: {
          title: true,
          ticket_cost: true,
        },
      },
    },
  })

  const raffleSums = await tx.$queryRaw<Array<{ raffle_id: bigint; qty: bigint | number | null }>>`
    SELECT raffle_id, COALESCE(SUM(quantity), 0) AS qty
    FROM purchase_transactions
    WHERE user_id = ${userId}
      AND type = ${'raffle_ticket'}
      AND raffle_id IS NOT NULL
    GROUP BY raffle_id
  `
  const raffleById = new Map<string, number>(
    (raffleSums || []).map(r => [r.raffle_id.toString(), typeof r.qty === 'bigint' ? Number(r.qty) : Number(r.qty || 0)])
  )

  for (const e of raffles) {
    const already = raffleById.get(e.raffle_id.toString()) || 0
    const remaining = Math.max(0, e.tickets - already)
    if (remaining <= 0) continue

    const pointsSpent = (e.raffle?.ticket_cost ?? 0) * remaining
    const itemName = e.raffle?.title ?? `Raffle – ${e.raffle_id.toString()}`
    const metadata = { legacy: true, source: 'raffle_entries' }

    await tx.$executeRaw`
      INSERT INTO purchase_transactions (
        user_id, type, quantity, points_spent, item_name, advent_item_id, raffle_id, metadata, created_at
      )
      VALUES (
        ${userId}, ${'raffle_ticket'}, ${remaining}, ${pointsSpent}, ${itemName}, NULL, ${e.raffle_id}, ${metadata as any}, ${e.created_at}
      )
    `
  }
}
