import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

// Remove sslmode from URL and handle SSL separately
const dbUrl = process.env.DATABASE_URL?.replace(/[?&]sslmode=[^&]+/, '') || '';

const pool = new pg.Pool({
  connectionString: dbUrl,
  ssl: {
    rejectUnauthorized: false,
  },
});

export const db = drizzle(pool, { schema });
export { schema };
