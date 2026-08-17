import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { verifyCredentials } from '@prometheus/auth';
import { authConfig } from './auth.config';
import { db } from './db';

/**
 * Full config -- extends authConfig with the DB-backed Credentials provider.
 * Used by everything except middleware.ts (route handlers, server
 * components, server actions), all of which run on the regular Node.js
 * runtime and can use the Postgres driver/bcrypt/node:crypto this provider
 * pulls in via @prometheus/auth. See auth.config.ts for why middleware
 * needs its own, separate, edge-safe NextAuth() instance instead of this one.
 *
 * The extension does NOT use this -- it has its own bearer-token pair (see
 * @prometheus/auth's tokens.ts and /api/v1/auth/token), issued through the
 * same verifyCredentials() check but otherwise independent, since NextAuth's
 * cookie-based session isn't something extension code can read or send.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const profile = await verifyCredentials(db, {
          email: credentials.email as string,
          password: credentials.password as string,
        });

        if (!profile) return null;

        return {
          id: profile.id,
          email: profile.email,
          name: profile.display_name ?? undefined,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
      }
      return token;
    },
  },
});

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
    };
  }
}
