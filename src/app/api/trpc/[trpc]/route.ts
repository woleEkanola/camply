import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "../../../../server/api/root";
import { createTRPCContext } from "../../../../server/api/trpc/context";

const handler = async (req: Request) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createTRPCContext({
      req,
      resHeaders: new Headers(),
      info: {
        isBatchCall: false,
        calls: [],
        accept: 'application/jsonl',
        connectionParams: {},
        type: 'query',
        signal: new AbortController().signal,
        url: new URL(req.url),
      },
    }),
  });
};

export { handler as GET, handler as POST };
