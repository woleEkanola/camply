import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Camply Offline Scan",
    short_name: "Camply",
    description: "Reliable offline-first camper registration, QR scanning, and event management.",
    start_url: "/",
    display: "standalone",
    background_color: "#0F172A",
    theme_color: "#0D9488",
    orientation: "portrait",
    icons: [
      {
        src: "/icon.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
