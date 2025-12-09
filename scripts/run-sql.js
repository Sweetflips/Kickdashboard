require('dotenv').config();
const fs = require('fs');
const { Client } = require('pg');
(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }
  const sqlFile = process.argv[2];
  if (!sqlFile) { console.error('Usage: node run-sql.js <path-to-sql-file>'); process.exit(1); }
  // Read file bytes and strip BOM if present; detect encoding
  let buf = fs.readFileSync(sqlFile);
  let sql = ''
  if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    // UTF-8 BOM
    buf = buf.slice(3)
    sql = buf.toString('utf8')
  } else if (buf[0] === 0xFF && buf[1] === 0xFE) {
    // UTF-16 LE BOM
    sql = buf.toString('utf16le')
  } else {
    sql = buf.toString('utf8')
  }
  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    console.log('Connected to DB, executing SQL...');
    await client.query('BEGIN');
    // Split SQL statements on semicolon followed by newline, ignoring blank lines
    const statements = sql.split(/;\s*\n/).map(s => s.trim()).filter(s => s.length > 0)
    for (const stmt of statements) {
      // Skip if it's a comment-only statement
      if (stmt.startsWith('--') || stmt.startsWith('/*')) continue
      console.log('Executing statement:', stmt.slice(0, 140))
      try {
        await client.query(stmt)
      } catch (err) {
        console.error('Failed statement:', stmt)
        throw err
      }
    }
    await client.query('COMMIT');
    console.log('SQL executed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('SQL execution failed:', err);
    try { await client.query('ROLLBACK'); } catch (e) {}
    process.exit(1);
  } finally { await client.end(); }
})();
