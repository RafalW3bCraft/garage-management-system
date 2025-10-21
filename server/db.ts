import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

let cachedDb: ReturnType<typeof drizzle> | null = null;
let cachedPool: Pool | null = null;
let databaseUrl: string | null = null;

async function getDatabaseUrl(): Promise<string> {
  if (databaseUrl) {
    return databaseUrl;
  }

  let url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;

  if (!url && process.env.PGHOST && process.env.PGUSER && process.env.PGPASSWORD && process.env.PGDATABASE && process.env.PGPORT) {
    url = `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}`;
  }

  if (url) {
    databaseUrl = url;
    return url;
  }

  throw new Error("No database connection available. Database credentials not found in environment.");
}

export async function getDb() {
  if (cachedDb) {
    return cachedDb;
  }

  try {
    let url = await getDatabaseUrl();
    const isProduction = process.env.NODE_ENV === 'production';

    const isNeonDatabase = url.includes('neon.tech') || url.includes('neon.') || process.env.DATABASE_PROVIDER === 'neon';

    let sslConfig: boolean | { rejectUnauthorized: boolean } = false;
    
    if (isNeonDatabase) {

      if (!url.includes('sslmode=') && !url.includes('ssl=')) {
        const separator = url.includes('?') ? '&' : '?';
        url = `${url}${separator}sslmode=require`;
      }

      sslConfig = isProduction 
        ? { rejectUnauthorized: true }
        : { rejectUnauthorized: false };
      
    }
    
    cachedPool = new Pool({
      connectionString: url,

      min: isProduction ? 2 : 1,
      max: isProduction ? 15 : 8,

      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      allowExitOnIdle: false,

      statement_timeout: 30000,

      query_timeout: 30000,

      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,

      ...(sslConfig && { ssl: sslConfig })
    });
    
    cachedPool.on('error', (err) => {
      console.error('[DB_POOL] Unexpected database pool error:', {
        message: err.message,
        stack: err.stack,
        timestamp: new Date().toISOString()
      });
      
      if (err.message === 'Connection terminated unexpectedly') {
        console.log('[DB_POOL] Attempting to reconnect...');
      }
    });
    
    cachedDb = drizzle(cachedPool, { schema });
    return cachedDb;
  } catch (error) {
    throw new Error(`Failed to connect to database: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(target, prop) {
    throw new Error("Database not initialized. Use getDb() instead of direct db access for lazy initialization.");
  }
});
