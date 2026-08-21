import { listPromptConfigs } from '@prometheus/prompts';
import { OPTIMIZATION_MODES } from '@prometheus/shared-types';
import { Button, Card, Input } from '@prometheus/ui';
import { db } from '@/lib/db';
import { createDraftPromptConfigAction, publishPromptConfigAction } from './actions';

const TEXTAREA_CLASSES =
  'w-full rounded border border-line bg-surface px-3 py-2 font-mono text-xs text-ink placeholder:text-ink-muted focus:border-glow focus:outline-none focus:ring-1 focus:ring-glow';
const PROMPT_PREVIEW_CLASSES =
  'max-h-40 overflow-y-auto whitespace-pre-wrap rounded border border-line bg-surface p-3 text-xs text-ink-muted';

export default async function AdminPromptConfigsPage() {
  const configs = await listPromptConfigs(db);

  return (
    <div className="flex flex-col gap-8">
      {OPTIMIZATION_MODES.map((mode) => {
        const modeConfigs = configs.filter((c) => c.name === mode);
        const published = modeConfigs.find((c) => c.status === 'published');
        const drafts = modeConfigs.filter((c) => c.status === 'draft');
        const archived = modeConfigs.filter((c) => c.status === 'archived');

        return (
          <section key={mode} className="flex flex-col gap-3">
            <h2 className="font-display text-lg font-semibold text-ink">{mode}</h2>

            <Card className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm">
                <p className="font-medium text-ink">
                  {published ? `${published.version} · ${published.model}` : 'No published version'}
                </p>
                {published?.publishedAt && (
                  <p className="text-ink-muted">published {published.publishedAt.toLocaleString()}</p>
                )}
              </div>
              {published && <pre className={PROMPT_PREVIEW_CLASSES}>{published.systemPrompt}</pre>}
            </Card>

            {drafts.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Drafts</p>
                {drafts.map((draft) => (
                  <Card key={draft.id} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between text-sm">
                      <p className="font-medium text-ink">
                        {draft.version} · {draft.model}
                      </p>
                      <form action={publishPromptConfigAction}>
                        <input type="hidden" name="configId" value={draft.id} />
                        <Button type="submit" variant="secondary">
                          Publish
                        </Button>
                      </form>
                    </div>
                    <pre className={PROMPT_PREVIEW_CLASSES}>{draft.systemPrompt}</pre>
                  </Card>
                ))}
              </div>
            )}

            {archived.length > 0 && (
              <details className="text-sm text-ink-muted">
                <summary className="cursor-pointer">
                  {archived.length} archived version{archived.length === 1 ? '' : 's'}
                </summary>
                <div className="mt-2 flex flex-col gap-1 pl-4">
                  {archived.map((a) => (
                    <p key={a.id}>
                      {a.version} · {a.model}
                      {a.publishedAt ? ` · was published ${a.publishedAt.toLocaleDateString()}` : ''}
                    </p>
                  ))}
                </div>
              </details>
            )}

            <Card className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">New draft</p>
              <form action={createDraftPromptConfigAction} className="flex flex-col gap-2">
                <input type="hidden" name="name" value={mode} />
                <div className="flex gap-2">
                  <Input name="version" placeholder="Version (e.g. v1.1)" required className="flex-1" />
                  <Input name="model" defaultValue="gpt-4o-mini" required className="flex-1" />
                </div>
                <textarea
                  name="systemPrompt"
                  required
                  rows={10}
                  defaultValue={published?.systemPrompt ?? ''}
                  className={TEXTAREA_CLASSES}
                />
                <Button type="submit" className="self-start">
                  Save as draft
                </Button>
              </form>
            </Card>
          </section>
        );
      })}
    </div>
  );
}
