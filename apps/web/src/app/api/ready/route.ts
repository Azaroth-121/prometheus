import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Readiness includes the database path used by authenticated requests.
// Keep the response generic because this route is available without a session.
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json(
      { status: 'ready' },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return NextResponse.json(
      { status: 'unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
