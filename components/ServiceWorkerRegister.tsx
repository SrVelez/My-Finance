"use client";

import { useEffect } from "react";

/** Registra o service worker (só em produção; em dev atrapalharia o HMR). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    }
  }, []);
  return null;
}
