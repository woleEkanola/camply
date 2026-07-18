import type { Metadata } from "next";
import "./globals.css";
import { TRPCProvider } from "./providers";
import { AuthProvider } from "./auth-provider";
import { NextSSRPlugin } from "@uploadthing/react/next-ssr-plugin";
import { extractRouterConfig } from "uploadthing/server";
import { ourFileRouter } from "./api/uploadthing/core";
import { Suspense } from "react";
import { Analytics } from "@vercel/analytics/next";

const geistSans = { variable: "font-sans" };
const geistMono = { variable: "font-mono" };

export const metadata: Metadata = {
  title: "Appointment App",
  description: "A full-stack appointment scheduling application",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <AuthProvider>
          <TRPCProvider>
            <Suspense>
              <NextSSRPlugin routerConfig={extractRouterConfig(ourFileRouter)} />
            </Suspense>
            {children}
            <Analytics />
          </TRPCProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
