import { getCloudflareContext } from '@opennextjs/cloudflare';
import { createDatabaseClient, type Database } from '@prometheus/database';
import { env } from './env';

/**
 * Two hosting shapes, one `db` export (every caller stays `import { db } from '@/lib/db'`):
 *
 * - **Cloudflare Workers** (OpenNext): a Worker can't reuse a socket across requests, and
 *   Postgres is reached through the Hyperdrive binding. So: one client **per request**, keyed
 *   on that request's ExecutionContext, built from `env.HYPERDRIVE.connectionString`, with
 *   `maxUses: 1` so no connection outlives its request. Hyperdrive does the real pooling.
 * - **Node** (Azure Container App, `next dev` without bindings): a single shared pool for the
 *   process, created lazily on first use rather than at import time -- Next's build-time
 *   "Collecting page data" pass imports every route module, and DATABASE_URL only exists at
 *   runtime.
 */
let processInstance: Database | undefined;
const perRequest = new WeakMap<object, Database>();

type HyperdriveEnv = { HYPERDRIVE?: { connectionString: string } };

function cloudflareDb(): Database | undefined {
  let context: ReturnType<typeof getCloudflareContext>;
  try {
    context = getCloudflareContext();
  } catch {
    return undefined; // not running inside a Worker request
  }
  const hyperdrive = (context.env as HyperdriveEnv).HYPERDRIVE;
  if (!hyperdrive) return undefined;

  const requestKey = context.ctx as object;
  let instance = perRequest.get(requestKey);
  if (!instance) {
    instance = createDatabaseClient(hyperdrive.connectionString, { maxUses: 1 });
    perRequest.set(requestKey, instance);
  }
  return instance;
}

function getDb(): Database {
  const workerInstance = cloudflareDb();
  if (workerInstance) return workerInstance;

  if (!processInstance) {
    processInstance = createDatabaseClient(env.databaseUrl);
  }
  return processInstance;
}

export const db: Database = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});
