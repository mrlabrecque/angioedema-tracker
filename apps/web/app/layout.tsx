import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "@/components/Providers";

export const metadata: Metadata = {
  title: "Angioedema Tracker",
  description: "Private personal health log",
  robots: { index: false, follow: false },
  other: {
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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased"><Providers>{children}</Providers></body>
    </html>
  );
}
