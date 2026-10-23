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
  // Azure Container Apps' ingress terminates TLS and forwards plain HTTP
  // internally, setting x-forwarded-proto to what the client actually used --
  // this is what lets us tell "client used http" apart from "internal hop",
  // which request.nextUrl.protocol can't distinguish on its own.
  const forwardedProto = request.headers.get('x-forwarded-proto');
  if (process.env.NODE_ENV === 'production' && forwardedProto === 'http') {
    const httpsUrl = new URL(request.nextUrl.toString());
    httpsUrl.protocol = 'https:';
    return NextResponse.redirect(httpsUrl, 308);
  }

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
  // Runs on every page except static assets and API routes -- the HTTPS
  // redirect needs to apply site-wide, not just the two protected prefixes,
  // but /api is excluded so this never touches a webhook request (e.g.
  // Stripe's signature-verified body) or the cron endpoint.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|icon|opengraph-image).*)'],
};
