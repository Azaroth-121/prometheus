import { createDatabaseClient, type Database } from '@prometheus/database';
import { env } from './env';

/**
 * Single shared Postgres connection for the whole app, created lazily on
 * first real use rather than at module-import time. Next.js's build-time
 * "Collecting page data" pass imports every route module to inspect it
 * (without ever calling GET/POST) -- an eager `createDatabaseClient(...)`
 * at module scope ran during that pass too and crashed the build, since
 * DATABASE_URL isn't set at build time, only at container runtime.
 */
let instance: Database | undefined;

function getDb(): Database {
  if (!instance) {
    instance = createDatabaseClient(env.databaseUrl);
  }
  return instance;
}

export const db: Database = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});
