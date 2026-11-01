"use client";

import { useEffect } from "react";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Registers the app-shell service worker (production builds only). */
export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(`${base}/sw.js`, { scope: `${base}/` }).catch(() => {});
  }, []);
  return null;
}
