import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function checkTable() {
  try {
    const conn = await pool.getConnection();
    const [rows] = await conn.query("SHOW TABLES LIKE 'excluded_symbols'");
    console.log('Table exists:', rows.length > 0);
    if (rows.length > 0) {
      const [cols] = await conn.query("DESCRIBE excluded_symbols");
      console.log('Columns:', cols.map(c => c.Field).join(', '));
    }
    conn.release();
  } catch (err) {
    console.error('Error:', err.message);
  }
  process.exit(0);
}

checkTable();
