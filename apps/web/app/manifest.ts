import type { MetadataRoute } from "next";

export const dynamic = "force-static";

// The site lives under a sub-path on GitHub Pages, so every URL here is prefixed with it.
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Angioedema Tracker",
    short_name: "Angioedema",
    description: "Private personal angioedema log",
    id: `${base}/`,
    start_url: `${base}/`,
    scope: `${base}/`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#101513",
    theme_color: "#101513",
    icons: [
      { src: `${base}/icons/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${base}/icons/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${base}/icons/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
