import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/lib/auth.config';

// Deliberately a separate, edge-safe NextAuth() instance built from
// authConfig alone -- NOT the full one exported from @/lib/auth, which pulls
// in the Postgres driver via its Credentials provider and breaks the Edge
// Runtime build (see auth.config.ts). This instance only needs to read the
// session cookie, not verify passwords.
const { auth } = NextAuth(authConfig);

const PROTECTED_PREFIXES = ['/dashboard', '/admin'];

export default auth((request) => {
  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    request.nextUrl.pathname.startsWith(prefix)
  );

  if (isProtected && !request.auth?.user) {
    const redirectUrl = new URL('/login', request.nextUrl);
    redirectUrl.searchParams.set('redirectTo', request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*'],
};
