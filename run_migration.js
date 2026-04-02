const mysql = require('mysql2/promise');
const fs = require('fs');

async function migrate() {
  try {
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });

    console.log('✓ Database connected');

    const sql = fs.readFileSync('./drizzle/0005_gorgeous_mentor.sql', 'utf-8');
    const statements = sql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);

    for (const stmt of statements) {
      try {
        await conn.execute(stmt);
        console.log('✓ Executed:', stmt.substring(0, 60));
      } catch (e) {
        if (e.code === 'ER_TABLE_EXISTS_ERROR' || e.code === 'ER_DUP_KEYNAME') {
          console.log('✓ Already exists');
        } else {
          console.error('✗ Error:', e.message);
        }
      }
    }

    await conn.end();
    console.log('✓ Migration completed');
  } catch (e) {
    console.error('✗ Connection failed:', e.message);
    process.exit(1);
  }
}

migrate();
