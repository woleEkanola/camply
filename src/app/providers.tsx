'use client';

import { QueryCache, MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink, loggerLink } from '@trpc/client';
import { useState } from 'react';
import superjson from 'superjson';
import { api } from '../utils/trpc';
import { signOut } from 'next-auth/react';

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    queryCache: new QueryCache({
      onError: (error: any) => {
        if (
          error?.data?.code === 'UNAUTHORIZED' ||
          error?.message === 'User not found'
        ) {
          console.warn('Stale session detected. Logging out...');
          void signOut({ callbackUrl: '/login' });
        }
      },
    }),
    mutationCache: new MutationCache({
      onError: (error: any) => {
        if (
          error?.data?.code === 'UNAUTHORIZED' ||
          error?.message === 'User not found'
        ) {
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
            process.env.NODE_ENV === 'development' ||
            (opts.direction === 'down' && opts.result instanceof Error),
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
