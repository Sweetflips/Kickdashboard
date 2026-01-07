import 'dotenv/config'
import pg from 'pg'
const { Client } = pg

const dbUrl = 'postgresql://postgres:TGlahexkFWDUIbBOxJKxmTyPPvnSdrIj@shuttle.proxy.rlwy.net:41247/railway'

const client = new Client({
  connectionString: dbUrl,
})

async function checkUserWager() {
  try {
    await client.connect()
    console.log('Connected to database\n')

    // Check all tables
    const tablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `)
    console.log('Available tables:', tablesResult.rows.map(r => r.table_name).join(', '))
    console.log()

    // Check platform_users table structure (this seems to be the correct table)
    const platformUsersInfo = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'platform_users'
      ORDER BY ordinal_position
    `)
    if (platformUsersInfo.rows.length > 0) {
      console.log('Platform users table columns:', platformUsersInfo.rows.map(r => r.column_name).join(', '))
      console.log()
    }

    // Find user in platform_users table
    let userResult = await client.query(
      `SELECT id, username, kick_user_id FROM platform_users WHERE LOWER(username) = LOWER($1)`,
      ['feyzaxy']
    )

    // If not found, try partial match
    if (userResult.rows.length === 0) {
      console.log('User "feyzaxy" not found, searching for similar usernames...')
      userResult = await client.query(
        `SELECT id, username, kick_user_id FROM platform_users WHERE LOWER(username) LIKE LOWER($1)`,
        ['%feyzaxy%']
      )
    }

    // Query purchase transactions from Dec 4-5, 2024
    const startDate = '2024-12-04T00:00:00Z'
    const endDate = '2024-12-06T00:00:00Z' // Up to but not including Dec 6

    if (userResult.rows.length === 0) {
      console.log('User "feyzaxy" not found')
      console.log('\nChecking platform_user_wagers table directly...')

      // Check platform_user_wagers table for the user
      const wagerResult = await client.query(`
        SELECT * FROM platform_user_wagers
        WHERE LOWER(username) = LOWER($1)
      `, ['feyzaxy'])

      if (wagerResult.rows.length > 0) {
        const wager = wagerResult.rows[0]
        console.log(`\nFound wager record for: ${wager.username}`)
        console.log(`Total Wagered: ${(parseInt(wager.total_wagered) || 0).toLocaleString()}`)
        console.log(`Razed Total Wagered: ${(parseInt(wager.razed_total_wagered) || 0).toLocaleString()}`)
        console.log(`Luxdrop Total Wagered: ${(parseInt(wager.luxdrop_total_wagered) || 0).toLocaleString()}`)
        console.log(`\nNote: This shows total lifetime wager, not just Dec 4-5.`)
        console.log(`To get Dec 4-5 specific data, we need to check transaction tables.`)
      } else {
        console.log('No wager record found for "feyzaxy"')

        // Check lead_wager_transactions table
        console.log('\nChecking lead_wager_transactions table...')
        const leadWagerCheck = await client.query(`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'lead_wager_transactions'
        `)

        if (leadWagerCheck.rows.length > 0) {
          console.log('lead_wager_transactions columns:', leadWagerCheck.rows.map(r => r.column_name).join(', '))

          // Try to find transactions by username or similar
          const leadWagerResult = await client.query(`
            SELECT * FROM lead_wager_transactions
            WHERE (LOWER(username) = LOWER($1) OR LOWER(player_username) = LOWER($1))
              AND created_at >= $2
              AND created_at < $3
            ORDER BY created_at ASC
          `, ['feyzaxy', startDate, endDate])

          if (leadWagerResult.rows.length > 0) {
            console.log(`\nFound ${leadWagerResult.rows.length} wager transactions:`)
            let total = 0
            leadWagerResult.rows.forEach((tx, idx) => {
              const amount = parseFloat(tx.amount || tx.wager_amount || 0)
              total += amount
              console.log(`${idx + 1}. ${new Date(tx.created_at).toISOString()} - Amount: ${amount.toLocaleString()}`)
            })
            console.log(`\nTOTAL WAGER (Dec 4-5): ${total.toLocaleString()}`)
          } else {
            console.log('No wager transactions found for "feyzaxy" between Dec 4-5')
          }
        }
      }
      return
    }

    const user = userResult.rows[0]
    console.log(`Found user: ${user.username} (ID: ${user.id}, Kick ID: ${user.kick_user_id})`)

    const transactionsResult = await client.query(
      `SELECT
        id, type, quantity, sweet_coins_spent, item_name,
        advent_item_id, raffle_id, created_at
      FROM platform_purchase_transactions
      WHERE user_id = $1
        AND created_at >= $2
        AND created_at < $3
      ORDER BY created_at ASC`,
      [user.id, startDate, endDate]
    )

    const transactions = transactionsResult.rows

    console.log(`\nFound ${transactions.length} transactions between Dec 4-5, 2024:`)
    console.log('='.repeat(80))

    let totalWager = 0
    transactions.forEach((tx, index) => {
      console.log(`\n${index + 1}. ${tx.type.toUpperCase()}`)
      console.log(`   Item: ${tx.item_name}`)
      console.log(`   Quantity: ${tx.quantity}`)
      console.log(`   Sweet Coins Spent: ${tx.sweet_coins_spent}`)
      console.log(`   Date: ${new Date(tx.created_at).toISOString()}`)
      if (tx.raffle_id) {
        console.log(`   Raffle ID: ${tx.raffle_id}`)
      }
      if (tx.advent_item_id) {
        console.log(`   Advent Item ID: ${tx.advent_item_id}`)
      }
      totalWager += parseInt(tx.sweet_coins_spent) || 0
    })

    console.log('\n' + '='.repeat(80))
    console.log(`\nTOTAL WAGER (Sweet Coins Spent): ${totalWager.toLocaleString()}`)
    console.log(`Total Transactions: ${transactions.length}`)

    // Also check if there are any raffle entries in that period
    const raffleEntriesResult = await client.query(
      `SELECT
        re.id, re.raffle_id, re.user_id, re.tickets, re.created_at,
        r.title, r.ticket_cost
      FROM platform_raffle_entries re
      JOIN platform_raffles r ON re.raffle_id = r.id
      WHERE re.user_id = $1
        AND re.created_at >= $2
        AND re.created_at < $3
      ORDER BY re.created_at ASC`,
      [user.id, startDate, endDate]
    )

    const raffleEntries = raffleEntriesResult.rows

    if (raffleEntries.length > 0) {
      console.log(`\n\nRaffle Entries (${raffleEntries.length}):`)
      console.log('='.repeat(80))
      raffleEntries.forEach((entry, index) => {
        const entryCost = parseInt(entry.tickets) * parseInt(entry.ticket_cost)
        console.log(`\n${index + 1}. ${entry.title}`)
        console.log(`   Tickets: ${entry.tickets}`)
        console.log(`   Cost per ticket: ${entry.ticket_cost}`)
        console.log(`   Total cost: ${entryCost}`)
        console.log(`   Date: ${new Date(entry.created_at).toISOString()}`)
      })
    }

  } catch (error) {
    console.error('Error:', error)
  } finally {
    await client.end()
  }
}

checkUserWager()
