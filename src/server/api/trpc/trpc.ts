import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { TRPCContext } from "./context";

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

// Create a middleware to check if the user is authenticated
const isAuthed = t.middleware(({ ctx, next }) => {
  // Check if session exists
  if (!ctx.session || !ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  
  // Check if user ID exists in session
  const userId = ctx.session?.user.id;
  if (!userId) {
    console.error("User ID is missing in session:", ctx.session);
    throw new TRPCError({ 
      code: "INTERNAL_SERVER_ERROR", 
      message: "User ID is missing in session" 
    });
  }

  return next({
    ctx: {
      // Keep all original context properties
      ...ctx,
      // Add the userId directly to the context
      userId,
    },
  });
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(isAuthed);
