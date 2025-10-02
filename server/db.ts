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

  console.log("=== Database URL Debug ===");
  console.log("DATABASE_URL:", process.env.DATABASE_URL ? "✓ exists" : "✗ missing");
  console.log("NEON_DATABASE_URL:", process.env.NEON_DATABASE_URL ? "✓ exists" : "✗ missing"); 
  console.log("POSTGRES_URL:", process.env.POSTGRES_URL ? "✓ exists" : "✗ missing");
  console.log("POSTGRES_PRISMA_URL:", process.env.POSTGRES_PRISMA_URL ? "✓ exists" : "✗ missing");
  console.log("Individual PostgreSQL vars:");
  console.log("- PGHOST:", process.env.PGHOST ? "✓ exists" : "✗ missing");
  console.log("- PGUSER:", process.env.PGUSER ? "✓ exists" : "✗ missing");
  console.log("- PGPASSWORD:", process.env.PGPASSWORD ? "✓ exists" : "✗ missing");
  console.log("- PGDATABASE:", process.env.PGDATABASE ? "✓ exists" : "✗ missing");
  console.log("- PGPORT:", process.env.PGPORT ? "✓ exists" : "✗ missing");

  // Check for full connection string first
  let url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;

  // If no full connection string, construct from PostgreSQL individual components
  if (!url && process.env.PGHOST && process.env.PGUSER && process.env.PGPASSWORD && process.env.PGDATABASE && process.env.PGPORT) {
    url = `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}`;
    console.log("Constructed URL from individual PostgreSQL vars");
  }

  if (url) {
    console.log("Final database URL available:", url ? "✓ success" : "✗ failed");
    databaseUrl = url;
    return url;
  }

  console.log("=== End Database URL Debug ===");
  throw new Error("No database connection available. Database credentials not found in environment.");
}

export async function getDb() {
  if (cachedDb) {
    return cachedDb;
  }

  try {
    const url = await getDatabaseUrl();
    cachedPool = new Pool({ connectionString: url });
    cachedDb = drizzle(cachedPool, { schema });
    return cachedDb;
  } catch (error) {
    throw new Error(`Failed to connect to database: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// For compatibility with existing imports, provide a legacy db export
// This will throw if database is not available, which maintains existing behavior for critical paths
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(target, prop) {
    throw new Error("Database not initialized. Use getDb() instead of direct db access for lazy initialization.");
  }
});
