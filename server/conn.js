import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
// Load environment variables
dotenv.config();

const poolConfig = {
  user: process.env.DB_USER || process.env.PGUSER || 'postgres',
  host: process.env.DB_HOST || process.env.PGHOST || 'localhost',
  database: process.env.DB_NAME || process.env.PGDATABASE || 'examapp',
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD || '',
  port: parseInt(process.env.DB_PORT || process.env.PGPORT || '5432', 10),
  max: parseInt(process.env.DB_POOL_MAX || '20', 10), // Max connections in pool
  idleTimeoutMillis: 30000, // Close idle clients after 30s
  connectionTimeoutMillis: 5000, // Connection timeout after 5s
};

export const pool = new Pool(poolConfig);

// Pool lifecycle event listeners
pool.on('connect', () => {
  console.log('[PostgreSQL] Connected to database pool successfully.');
});

pool.on('error', (err) => {
  console.error('[PostgreSQL] Unexpected error on idle database client:', err.message);
});

/**
 * Helper to run parameterized queries directly on the pool
 * @param {string} text - SQL query string
 * @param {Array} params - Query parameters
 */


export default pool;
