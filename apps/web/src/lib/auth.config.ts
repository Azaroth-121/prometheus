import type { NextAuthConfig } from 'next-auth';

/**
 * Edge-safe subset of the NextAuth config -- no Credentials provider here,
 * since its authorize() callback pulls in the Postgres driver, bcrypt, and
 * node:crypto (via @prometheus/auth), none of which are Edge Runtime
 * compatible. middleware.ts runs on the Edge Runtime by default, so it
 * builds its own NextAuth() instance from just this file; auth.ts (used by
 * everything else -- route handlers, server components, server actions,
 * which all run on the regular Node.js runtime) extends this with the real
 * provider. This is NextAuth v5's own documented pattern for exactly this
 * split, not a workaround specific to this app.
 */
export const authConfig = {
  session: { strategy: 'jwt' },
  trustHost: true,
  pages: {
    signIn: '/login',
  },
  providers: [],
  callbacks: {
    async session({ session, token }) {
      if (token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
