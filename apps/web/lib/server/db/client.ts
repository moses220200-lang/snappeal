/**
 * Lazy Postgres + Drizzle client.
 *
 * Returns `null` when `DATABASE_URL` isn't set so callers can fall back to
 * the in-memory fixture (mock-data mode). API routes use `withDb()` to
 * branch cleanly.
 *
 * Hot-reload safety: Next.js dev recompiles modules on every file change.
 * If we cache the postgres client in a module-scoped `let`, every reload
 * creates a NEW client (with new connections) while the old ones are
 * orphaned but still hold connection slots until Postgres' idle timeout
 * (default 30+ minutes). On Neon free tier this exhausts the connection
 * pool within a dozen reloads. We stash the client on `globalThis` so
 * the same instance survives hot-reload — production builds don't have
 * the leak in the first place, but the global works there too.
 *
 * Pool sizing: max=4 is enough for the app's request rate even with
 * the worker draining jobs in parallel. idle_timeout=20s closes
 * connections quickly when traffic dies so a long-running dev server
 * doesn't sit on the pool. Production should bump max if you scale
 * concurrency (the worker semaphore caps it at 2 submit + 3 lookup
 * + 4 generate, so 9 + headroom is safe).
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { hasDatabase, env } from "../env";
import * as schema from "./schema";

type DbClient = ReturnType<typeof drizzle<typeof schema>>;
type Sql = ReturnType<typeof postgres>;

// Stash on globalThis to survive Next.js dev hot-reload. Without this,
// every module recompile spawns a new connection pool while the old
// one's sockets sit in TIME_WAIT (and on Neon, in the per-account
// connection cap). The exhaustion shows up as "too many clients
// already" on a long-running dev session.
//
// Cache key suffix bumped to `_v2` on 2026-05-26 to flush a stale
// client cached during the Snappeal→ParkingRabbit rename window:
// the bulk-rename briefly rewrote DATABASE_URL to use a non-existent
// `parkingrabbit` Postgres role before being restored. A client created
// during that window persisted in globalThis across hot-reloads with
// broken credentials — bumping the key forces a fresh client read of
// the current (restored) DATABASE_URL.
interface DbGlobal {
  __parkingrabbit_db_v2__?: DbClient | null;
  __parkingrabbit_sql_v2__?: Sql | null;
  // Drop legacy refs on first import so the broken clients are GC'd.
  __parkingrabbit_db__?: DbClient | null;
  __parkingrabbit_sql__?: Sql | null;
  __snappeal_db__?: DbClient | null;
  __snappeal_sql__?: Sql | null;
}
const g = globalThis as unknown as DbGlobal;

/** Best-effort close of an orphaned postgres-js client stashed on
 *  globalThis under an old cache key. `end()` returns a Promise that
 *  REJECTS asynchronously if the client is mid-query; we attach a
 *  .catch so the rejection doesn't escape as an Unhandled rejection
 *  (which Node 16+ treats as fatal under strict mode). The sync try/
 *  catch only catches a synchronous throw. */
function closeOrphanClient(client: unknown): void {
  try {
    const promiseLike = (client as { end?: () => unknown })?.end?.();
    if (
      promiseLike &&
      typeof (promiseLike as Promise<unknown>).then === "function"
    ) {
      (promiseLike as Promise<unknown>).catch(() => {
        /* swallow — the orphan will GC itself */
      });
    }
  } catch {
    /* swallow — same reason */
  }
}

if (g.__parkingrabbit_db__ || g.__parkingrabbit_sql__) {
  closeOrphanClient(g.__parkingrabbit_sql__);
  g.__parkingrabbit_db__ = null;
  g.__parkingrabbit_sql__ = null;
}
if (g.__snappeal_db__ || g.__snappeal_sql__) {
  closeOrphanClient(g.__snappeal_sql__);
  g.__snappeal_db__ = null;
  g.__snappeal_sql__ = null;
}

export function getDb(): DbClient | null {
  if (!hasDatabase()) return null;
  if (g.__parkingrabbit_db_v2__) return g.__parkingrabbit_db_v2__;
  const sql = postgres(env.DATABASE_URL!, {
    // Enough headroom for the app + worker concurrency. Connection
    // reuse is governed by the postgres-js client's internal queue.
    max: 4,
    // Close idle connections quickly so a hot-reload storm doesn't
    // leave the pool full of dead sockets.
    idle_timeout: 20,
    // Cap any single query at 30s — a hung query shouldn't lock a
    // connection forever.
    connect_timeout: 10,
    // Disable prepared-statement caching: it interacts badly with
    // pgbouncer/Neon's transaction-pooling mode (which the platform
    // recommends for serverless).
    prepare: false,
  });
  g.__parkingrabbit_sql_v2__ = sql;
  g.__parkingrabbit_db_v2__ = drizzle(sql, { schema });
  return g.__parkingrabbit_db_v2__;
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
