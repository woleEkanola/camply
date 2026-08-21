'use client';

import { QueryCache, MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink, loggerLink } from '@trpc/client';
import { useState } from 'react';
import superjson from 'superjson';
import { api } from '../utils/trpc';
import { signOut } from 'next-auth/react';
import '@/lib/pwaPrompt';

// UNAUTHORIZED is thrown by many procedures for ordinary business-logic
// reasons that have nothing to do with the session being stale — e.g.
// communication.ts's orgId(ctx) throws UNAUTHORIZED "No organization" for a
// SUPER_ADMIN opening any communication page, since they're org-less by
// design. Matching on code alone force-signed-out every such user
// instantly. The two messages below are the actual "your session is no
// longer valid" signals: protectedProcedure's own auth middleware
// (src/server/api/trpc/trpc.ts) throws exactly "Not authenticated" when
// there's no session at all, and several routers throw exactly
// "User not found" when a session's user record has been deleted since the
// token was issued. Match on the specific message, not the code.
function isStaleSessionError(error: any): boolean {
  if (error?.message === 'User not found') return true;
  return error?.data?.code === 'UNAUTHORIZED' && error?.message === 'Not authenticated';
}

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    queryCache: new QueryCache({
      onError: (error: any) => {
        if (isStaleSessionError(error)) {
          console.warn('Stale session detected. Logging out...');
          void signOut({ callbackUrl: '/login' });
        }
      },
    }),
    mutationCache: new MutationCache({
      onError: (error: any) => {
        if (isStaleSessionError(error)) {
          console.warn('Stale session detected on mutation. Logging out...');
          void signOut({ callbackUrl: '/login' });
        }
      },
    }),
  }));
  const [trpcClient] = useState(() =>
    api.createClient({
      links: [
        loggerLink({
          enabled: (opts) =>
            opts.direction === 'down' && opts.result instanceof Error,
        }),
        httpBatchLink({
          url: '/api/trpc',
          transformer: superjson,
        }),
      ],
    })
  );

  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </api.Provider>
  );
}
