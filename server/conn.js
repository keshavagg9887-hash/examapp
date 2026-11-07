
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'examapp_db',
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT || 5432),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('connect', () => {
  console.log('[PostgreSQL] Connected successfully!');
});

pool.on('error', (err) => {
  console.error('[PostgreSQL] Error:', err.message);
});

export const query = (text, params) => pool.query(text, params);

export { pool };
export default pool;


