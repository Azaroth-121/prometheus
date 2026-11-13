import {
  claimUsageAlert,
  getUsageAlertRecipients,
  markUsageAlertSent,
  releaseUsageAlert,
  usageThresholdReached,
  type CurrentPlanInfo,
  type UsageAmounts,
} from '@prometheus/billing';
import { systemEvents } from '@prometheus/database';
import { db } from '@/lib/db';
import { env } from '@/lib/env';

const WEBHOOK_TIMEOUT_MS = 5000;

async function logSystemEvent(
  severity: 'info' | 'warning' | 'error',
  message: string,
  metadata: Record<string, unknown>
) {
  await db.insert(systemEvents).values({
    service: 'usage_alerts',
    severity,
    eventType: 'usage_alert',
    message,
    metadata,
  });
}

/**
 * Emails the organization's owner and billing managers the first time its
 * shared pool reaches 80% and 100% in a usage period (C.5). Called by
 * /api/v1/optimize with the usage counted after the current request, so the
 * alert goes out as the line is crossed rather than waiting for a daily job.
 *
 * Never throws: an alert that can't be sent must not fail the request. A
 * failed send is released so a later request retries it; a missing webhook
 * URL is logged once per threshold per period instead of on every request.
 */
export async function sendUsageAlertIfNeeded(planInfo: CurrentPlanInfo, used: UsageAmounts): Promise<void> {
  if (!planInfo.organizationId) return;

  const limits = { requests: planInfo.monthlyRequestLimit, tokens: planInfo.monthlyTokenLimit };
  const threshold = usageThresholdReached(used, limits);
  if (!threshold) return;

  const metadata = { organization_id: planInfo.organizationId, threshold };

  try {
    const alertId = await claimUsageAlert(db, {
      organizationId: planInfo.organizationId,
      threshold,
      periodStart: new Date(planInfo.periodStart),
      used,
      limits,
    });
    if (!alertId) return;

    let webhookUrl: string;
    try {
      webhookUrl = env.makeUsageAlertWebhookUrl;
    } catch {
      await logSystemEvent('warning', 'Usage alert not emailed: MAKE_USAGE_ALERT_WEBHOOK_URL is not set.', metadata);
      return;
    }

    const recipients = await getUsageAlertRecipients(db, planInfo.organizationId);
    if (recipients.length === 0) {
      await logSystemEvent('warning', 'Usage alert not emailed: no active owner or billing manager.', metadata);
      return;
    }

    const results = await Promise.allSettled(
      recipients.map(async (recipient) => {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
          body: JSON.stringify({
            email: recipient.email,
            display_name: recipient.displayName,
            organization_name: planInfo.organizationName,
            plan_name: planInfo.planName,
            threshold,
            requests_used: used.requests,
            requests_limit: planInfo.monthlyRequestLimit,
            tokens_used: used.tokens,
            tokens_limit: planInfo.monthlyTokenLimit,
            resets_at: planInfo.expiresAt,
            manage_url: `${env.appUrl}/dashboard/billing`,
          }),
        });
        if (!response.ok) throw new Error(`Webhook responded ${response.status}`);
      })
    );

    const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    for (const failure of failures) {
      await logSystemEvent(
        'error',
        `Failed to send usage alert: ${failure.reason instanceof Error ? failure.reason.message : String(failure.reason)}`,
        metadata
      );
    }

    if (failures.length === recipients.length) {
      await releaseUsageAlert(db, alertId);
      return;
    }

    await markUsageAlertSent(db, alertId);
    await logSystemEvent('info', `Sent ${threshold}% usage alert to ${recipients.length - failures.length} recipient(s).`, metadata);
  } catch (error) {
    await logSystemEvent(
      'error',
      `Usage alert check failed: ${error instanceof Error ? error.message : String(error)}`,
      metadata
    ).catch(() => {});
  }
}
