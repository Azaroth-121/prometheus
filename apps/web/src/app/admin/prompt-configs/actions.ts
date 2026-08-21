'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getCurrentProfile, requireAdmin } from '@prometheus/auth';
import { adminAuditLogs } from '@prometheus/database';
import { createDraftPromptConfig, publishPromptConfig } from '@prometheus/prompts';
import type { OptimizationMode } from '@prometheus/shared-types';
import { OPTIMIZATION_MODES } from '@prometheus/shared-types';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

function isPgUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === '23505';
}

export async function createDraftPromptConfigAction(formData: FormData) {
  const name = String(formData.get('name'));
  const version = String(formData.get('version')).trim();
  const model = String(formData.get('model')).trim();
  const systemPrompt = String(formData.get('systemPrompt')).trim();

  if (!OPTIMIZATION_MODES.includes(name as OptimizationMode)) {
    throw new Error('Invalid mode.');
  }
  if (!version || !model || !systemPrompt) {
    throw new Error('Version, model, and system prompt are all required.');
  }

  const session = await auth();
  const actorProfile = requireAdmin(session?.user?.id ? await getCurrentProfile(db, session.user.id) : null);

  let created;
  try {
    created = await createDraftPromptConfig(db, {
      name,
      version,
      model,
      systemPrompt,
      createdBy: actorProfile.id,
    });
  } catch (err) {
    if (isPgUniqueViolation(err)) {
      throw new Error(`A "${name}" config with version "${version}" already exists.`);
    }
    throw err;
  }

  const ipAddress = (await headers()).get('x-forwarded-for');
  await db.insert(adminAuditLogs).values({
    adminUserId: actorProfile.id,
    action: 'create_draft_prompt_config',
    targetType: 'prompt_config',
    targetId: created.id,
    afterState: { name: created.name, version: created.version, status: created.status },
    ipAddress,
  });

  revalidatePath('/admin/prompt-configs');
}

export async function publishPromptConfigAction(formData: FormData) {
  const configId = String(formData.get('configId'));

  const session = await auth();
  const actorProfile = requireAdmin(session?.user?.id ? await getCurrentProfile(db, session.user.id) : null);

  const published = await publishPromptConfig(db, configId);

  const ipAddress = (await headers()).get('x-forwarded-for');
  await db.insert(adminAuditLogs).values({
    adminUserId: actorProfile.id,
    action: 'publish_prompt_config',
    targetType: 'prompt_config',
    targetId: published.id,
    afterState: { name: published.name, version: published.version, status: published.status },
    ipAddress,
  });

  revalidatePath('/admin/prompt-configs');
}
