import type { MetadataRoute } from "next";

/** Lets phones install the app, and is what an Android (TWA) wrapper reads for the Play Store. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ludo Darbar",
    short_name: "Ludo Darbar",
    description: "Every Ludo ever played.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#3c0814",
    theme_color: "#3c0814",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
