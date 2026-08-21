import { and, desc, eq } from 'drizzle-orm';
import type { Database, NewPromptConfigRow, PromptConfigRow } from '@prometheus/database';
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

/** All rows, newest first within each name -- the admin page groups these by mode itself. */
export async function listPromptConfigs(db: Database): Promise<PromptConfigRow[]> {
  return db.select().from(promptConfigs).orderBy(promptConfigs.name, desc(promptConfigs.createdAt));
}

export type NewDraftPromptConfig = Pick<
  NewPromptConfigRow,
  'name' | 'version' | 'systemPrompt' | 'model' | 'createdBy'
>;

/**
 * `unique(name, version)` (from 0000_init.sql) rejects a duplicate version
 * tag for the same mode -- callers should catch that as a friendly error
 * rather than a raw 500, same as apps/web's isPgUniqueViolation pattern.
 */
export async function createDraftPromptConfig(
  db: Database,
  input: NewDraftPromptConfig
): Promise<PromptConfigRow> {
  const [row] = await db
    .insert(promptConfigs)
    .values({ ...input, status: 'draft' })
    .returning();

  if (!row) {
    throw new Error('Failed to create the draft prompt config.');
  }
  return row;
}

/**
 * Archives whatever's currently published for the target's mode and
 * publishes the target, atomically -- the partial unique index is never
 * even momentarily violated. Only a `draft` row can be published; publishing
 * an already-published/archived row by mistake is rejected rather than
 * silently re-stamping publishedAt, a check the old manual-SQL runbook never had.
 */
export async function publishPromptConfig(db: Database, configId: string): Promise<PromptConfigRow> {
  return db.transaction(async (tx) => {
    const [target] = await tx.select().from(promptConfigs).where(eq(promptConfigs.id, configId)).limit(1);
    if (!target) {
      throw new Error('Prompt config not found.');
    }
    if (target.status !== 'draft') {
      throw new Error('Only draft configs can be published.');
    }

    await tx
      .update(promptConfigs)
      .set({ status: 'archived' })
      .where(and(eq(promptConfigs.name, target.name), eq(promptConfigs.status, 'published')));

    const [published] = await tx
      .update(promptConfigs)
      .set({ status: 'published', publishedAt: new Date() })
      .where(eq(promptConfigs.id, configId))
      .returning();

    if (!published) {
      throw new Error('Failed to publish the prompt config.');
    }
    return published;
  });
}
