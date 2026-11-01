import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "@/components/Providers";
import ServiceWorker from "@/components/ServiceWorker";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "Angioedema Tracker",
  description: "Private personal health log",
  robots: { index: false, follow: false },
  icons: { icon: `${base}/icons/icon-192.png`, apple: `${base}/icons/apple-touch-icon.png` },
  appleWebApp: { capable: true, title: "Angioedema", statusBarStyle: "default" },
  other: {
    "apple-mobile-web-app-capable": "yes",
    // GitHub Pages cannot set headers; restrict connections to self + the API origin.
    "Content-Security-Policy": [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      `connect-src 'self' ${process.env.NEXT_PUBLIC_API_URL ?? ""}`,
      "base-uri 'self'",
      "form-action 'none'",
    ].join("; "),
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f5" },
    { media: "(prefers-color-scheme: dark)", color: "#101513" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        <ServiceWorker />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
