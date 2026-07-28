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
    question: 'This still feels like a prototype — is it?',
    answer:
      "Yes. Pricing, limits, and several flows here are still being validated and will change before a real launch.",
  },
];

export default function FaqsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">FAQs</h1>
      <div className="flex flex-col gap-3">
        {FAQS.map((faq) => (
          <Card key={faq.question}>
            <p className="font-medium">{faq.question}</p>
            <p className="mt-1 text-sm text-gray-600">{faq.answer}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
