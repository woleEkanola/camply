import withSerwistInit from "@serwist/next";
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  additionalPrecacheEntries: [{ url: "/~offline", revision: "1" }],
});

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "@next-auth/prisma-adapter", "@napi-rs/canvas"],
  async redirects() {
    const areas = ["admin", "teacher", "volunteer"];
    return areas.flatMap((area) => [
      { source: `/${area}/check-in`, destination: `/${area}/qr-scan`, permanent: false },
      { source: `/${area}/check-out`, destination: `/${area}/qr-scan`, permanent: false },
    ]);
  },
};

export default withSentryConfig(withSerwist(nextConfig), {
  org: "adewolemi",
  project: "camply",
  silent: !process.env.CI,
  widenClientFileUpload: true,
  webpack: {
    automaticVercelMonitors: true,
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
