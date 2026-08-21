import { and, eq } from 'drizzle-orm';
import type { Database, PromptConfigRow } from '@prometheus/database';
import { promptConfigs } from '@prometheus/database';
import type { OptimizationMode } from '@prometheus/shared-types';

/**
 * `prompt_configs.name` maps 1:1 to OptimizationMode. A partial unique index
 * (see drizzle/0002_activate_prompt_versioning.sql) guarantees at most one
 * published row per name, so this is never ambiguous. No caching -- a
 * publish/archive elsewhere takes effect on the very next call.
 */
export async function getActivePromptConfig(
  db: Database,
  mode: OptimizationMode
): Promise<PromptConfigRow | undefined> {
  const [config] = await db
    .select()
    .from(promptConfigs)
    .where(and(eq(promptConfigs.name, mode), eq(promptConfigs.status, 'published')))
    .limit(1);

  return config;
}
