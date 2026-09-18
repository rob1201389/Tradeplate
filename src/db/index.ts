import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __tradeplateSql: ReturnType<typeof postgres> | undefined;
  // eslint-disable-next-line no-var
  var __tradeplateDb: PostgresJsDatabase<typeof schema> | undefined;
}

/**
 * Lazily connects on first query so `next build` doesn't need a live database.
 */
export function getDb(): PostgresJsDatabase<typeof schema> {
  if (globalThis.__tradeplateDb) return globalThis.__tradeplateDb;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and point it at your Postgres database.",
    );
  }
  globalThis.__tradeplateSql ??= postgres(url, { max: 1, prepare: false });
  globalThis.__tradeplateDb = drizzle(globalThis.__tradeplateSql, { schema });
  return globalThis.__tradeplateDb;
}

export { schema };
