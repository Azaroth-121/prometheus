import type { ReactNode } from 'react';
import { createStripeClient, formatInvoiceAmount, listInvoices, type BillingInvoice } from '@prometheus/billing';
import { Card } from '@prometheus/ui';
import { env } from '@/lib/env';

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  paid: { label: 'Paid', className: 'text-ink-muted' },
  open: { label: 'Due', className: 'text-amber-400' },
  uncollectible: { label: 'Unpaid', className: 'text-red-400' },
  void: { label: 'Void', className: 'text-ink-muted' },
};

function BillingHistoryCard({ children }: { children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">Billing history</h2>
        <p className="text-sm text-ink-muted">Your last 12 invoices, including renewals and license changes.</p>
      </div>
      {children}
    </Card>
  );
}

export function BillingHistoryLoading() {
  return (
    <BillingHistoryCard>
      <p className="text-sm text-ink-muted">Loading invoices...</p>
    </BillingHistoryCard>
  );
}

/** Invoices straight from Stripe for the billing scope's customer (C.3). Only rendered for owners and billing managers. */
export async function BillingHistory({ customerId }: { customerId: string }) {
  let invoices: BillingInvoice[];
  try {
    invoices = await listInvoices(createStripeClient(env.stripeSecretKey), customerId);
  } catch (err) {
    console.error('Failed to load invoices from Stripe', err);
    return (
      <BillingHistoryCard>
        <p className="text-sm text-amber-400">Invoices could not be loaded right now. Try again later, or open Manage billing.</p>
      </BillingHistoryCard>
    );
  }

  return (
    <BillingHistoryCard>
      {invoices.length === 0 && <p className="text-sm text-ink-muted">No invoices yet.</p>}
      {invoices.map((invoice) => {
        const status = STATUS_LABELS[invoice.status ?? ''] ?? { label: invoice.status ?? 'Unknown', className: 'text-ink-muted' };
        return (
          <div key={invoice.id} className="flex flex-col gap-1 border-t border-line pt-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <p className="text-ink">
                {invoice.createdAt.toLocaleDateString()} · {formatInvoiceAmount(invoice.total, invoice.currency)}{' '}
                <span className={status.className}>· {status.label}</span>
              </p>
              {invoice.number && <p className="break-words text-ink-muted">{invoice.number}</p>}
            </div>
            <div className="flex shrink-0 gap-4">
              {invoice.hostedInvoiceUrl && (
                <a href={invoice.hostedInvoiceUrl} target="_blank" rel="noopener noreferrer" className="text-glow-cyan hover:underline">
                  View
                </a>
              )}
              {invoice.pdfUrl && (
                <a href={invoice.pdfUrl} target="_blank" rel="noopener noreferrer" className="text-glow-cyan hover:underline">
                  PDF
                </a>
              )}
            </div>
          </div>
        );
      })}
    </BillingHistoryCard>
  );
}
