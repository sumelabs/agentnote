"use client";

import { useEffect } from "react";
import { bindPwaInstallListeners } from "@/lib/pwa/install-prompt";

/**
 * Parks Chromium's one-shot `beforeinstallprompt` from the root layout, so the
 * account menu can offer "Install app" even though the event fires before that
 * chrome mounts. Reads no session: `/login` and public `/p/*` pages park the
 * same event.
 *
 * Listener-only. No `preventDefault()` (Chrome's own install banner stays),
 * no service worker, no fetch on boot.
 */
export function PwaInstallBoot() {
  useEffect(() => bindPwaInstallListeners(), []);
  return null;
}
