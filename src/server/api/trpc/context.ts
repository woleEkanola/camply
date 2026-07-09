import { prisma } from "../../db";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/authOptions";

export async function createTRPCContext() {
  // Get the session with the auth configuration
  const session = await getServerSession(authOptions);

  return {
    prisma,
    session: session ?? null, // add null check
  };
}

export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;
