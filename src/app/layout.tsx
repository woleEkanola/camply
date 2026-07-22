import type { Metadata, Viewport } from "next";
import "./globals.css";
import { TRPCProvider } from "./providers";
import { AuthProvider } from "./auth-provider";
import { ToastProvider } from "@/components/ui/Toast";
import { BrandColorProvider } from "@/components/theme/BrandColorProvider";
import { NextSSRPlugin } from "@uploadthing/react/next-ssr-plugin";
import { extractRouterConfig } from "uploadthing/server";
import { ourFileRouter } from "./api/uploadthing/core";
import { Suspense } from "react";
import { Analytics } from "@vercel/analytics/next";

const geistSans = { variable: "font-sans" };
const geistMono = { variable: "font-mono" };

export const metadata: Metadata = {
  title: "Camply",
  description: "Camp management platform for registration, check-in, and staff operations",
};

// viewportFit: "cover" lets fixed mobile chrome (bottom nav, bottom-sheet
// dialogs) paint under the notch/home-indicator and pad it back in with
// env(safe-area-inset-*); userScalable/maximumScale are deliberately left
// unset so pinch-zoom stays available (WCAG 1.4.4).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#e67e22",
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
            <BrandColorProvider>
              <Suspense>
                <NextSSRPlugin routerConfig={extractRouterConfig(ourFileRouter)} />
              </Suspense>
              <ToastProvider>{children}</ToastProvider>
              <Analytics />
            </BrandColorProvider>
          </TRPCProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
