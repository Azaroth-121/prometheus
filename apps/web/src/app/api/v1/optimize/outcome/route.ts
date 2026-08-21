import { NextResponse, type NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import type { SubmitOutcomeRequestBody } from '@prometheus/shared-types';
import { verifyAccessToken } from '@prometheus/auth';
import { optimizationRequests } from '@prometheus/database';
import { db } from '@/lib/db';
import { env } from '@/lib/env';

const VALID_OUTCOMES = ['accepted', 'rejected', 'retried'];

/**
 * The one signal Prometheus currently captures about whether an optimization
 * was actually good -- everything downstream (an evaluation harness, a
 * "verified improvement rate" metric) depends on this existing first. See
 * documentation/architecture/full-technical-reference.md.
 */
export async function POST(request: NextRequest) {
  const accessToken = request.headers.get('authorization')?.replace('Bearer ', '') ?? null;
  if (!accessToken) {
    return NextResponse.json({ error: 'Missing bearer token.' }, { status: 401 });
  }

  const userId = verifyAccessToken(accessToken, env.extensionJwtSecret);
  if (!userId) {
    return NextResponse.json({ error: 'Invalid or expired session.' }, { status: 401 });
  }

  let body: SubmitOutcomeRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed JSON body.' }, { status: 400 });
  }

  if (!body.request_id || !VALID_OUTCOMES.includes(body.outcome)) {
    return NextResponse.json({ error: '"request_id" and a valid "outcome" are required.' }, { status: 400 });
  }

  // Ownership check is load-bearing: request_id alone must never be enough to
  // write this row, or one user could overwrite another's outcome.
  const result = await db
    .update(optimizationRequests)
    .set({ outcome: body.outcome, outcomeRecordedAt: new Date() })
    .where(and(eq(optimizationRequests.id, body.request_id), eq(optimizationRequests.userId, userId)))
    .returning({ id: optimizationRequests.id });

  if (result.length === 0) {
    return NextResponse.json({ error: 'Request not found.' }, { status: 404 });
  }

  return NextResponse.json({ status: 'ok' });
}
