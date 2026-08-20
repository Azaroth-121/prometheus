import { Card } from '@prometheus/ui';

const FAQS = [
  {
    question: 'What does Prometheus actually do?',
    answer:
      'You give it a rough, unclear request and it rewrites it into a clearer, more effective prompt you can run yourself against an AI of your choosing.',
  },
  {
    question: 'Does Prometheus do the task for me?',
    answer:
      "No — it never executes, answers, or fulfills the underlying request. It only ever returns an improved prompt (plus notes on what it changed), never the finished deliverable.",
  },
  {
    question: 'Is my prompt content stored?',
    answer:
      "No. By default Prometheus doesn't store the text of your requests or the optimized results — only metadata like timestamps and character counts, used for usage tracking.",
  },
  {
    question: 'What happens when my paid period ends?',
    answer:
      'Paid plans are one-time payments that grant 30 days of access, not auto-renewing subscriptions. When that period lapses without a new payment, your account reverts to the Free tier automatically — no cancellation needed.',
  },
  {
    question: 'How do I get more access?',
    answer: 'Head to the Billing page and pay for another 30-day period on any tier, any time.',
  },
  {
    question: 'Is pricing final?',
    answer:
      'Not yet — plan pricing and limits are still being tuned based on real usage. Existing paid periods always run for the full 30 days you paid for, even if the listed price changes afterward.',
  },
];

export default function FaqsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-semibold text-ink">FAQs</h1>
      <div className="flex flex-col gap-3">
        {FAQS.map((faq) => (
          <Card key={faq.question}>
            <p className="font-medium text-ink">{faq.question}</p>
            <p className="mt-1 text-sm text-ink-muted">{faq.answer}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
