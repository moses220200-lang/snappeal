/**
 * Lazy Postgres + Drizzle client.
 *
 * Returns `null` when `DATABASE_URL` isn't set so callers can fall back to
 * the in-memory fixture (mock-data mode). API routes use `withDb()` to
 * branch cleanly.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { hasDatabase, env } from "../env";
import * as schema from "./schema";

type DbClient = ReturnType<typeof drizzle<typeof schema>>;

let cachedDb: DbClient | null = null;
let cachedSql: ReturnType<typeof postgres> | null = null;

export function getDb(): DbClient | null {
  if (!hasDatabase()) return null;
  if (!cachedDb) {
    cachedSql = postgres(env.DATABASE_URL!, {
      max: 1, // single connection — Next.js serverless friendly
      prepare: false,
    });
    cachedDb = drizzle(cachedSql, { schema });
  }
  return cachedDb;
}

/** Helper for API routes: run the callback only if DB is wired. */
export async function withDb<T>(
  fn: (db: DbClient) => Promise<T>,
): Promise<T | null> {
  const db = getDb();
  if (!db) return null;
  return fn(db);
}

export { schema };
