import { createTRPCReact } from "@trpc/react-query";
import { type AppRouter } from "../server/api/root";

export const api = createTRPCReact<AppRouter>();

export function getBaseUrl() {
  if (typeof window !== "undefined") {
    return "";
  }
  
  // Reference for vercel.app preview deployment
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  
  // Assume localhost in development
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export function getUrl() {
  return getBaseUrl() + "/api/trpc";
}
