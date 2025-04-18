import { prisma } from "../../db";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../app/api/auth/[...nextauth]/route";

export async function createTRPCContext() {
  // Get the session with the auth configuration
  const session = await getServerSession(authOptions);
  
  // Log session information for debugging
  console.log("TRPC Context - Session:", session);
  
  return {
    prisma,
    session,
  };
}

export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;
