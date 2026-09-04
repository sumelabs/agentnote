"use client";

import { useCallback, useSyncExternalStore } from "react";
import { isInstalledDisplayMode } from "./display-mode";

/**
 * `beforeinstallprompt` store.
 *
 * Chromium fires the event once per page, usually before any product chrome
 * mounts, so the listener binds from the root layout (`PwaInstallBoot`) and
 * parks the event here; the account menu subscribes later and offers
 * "Install app" while the event is parked.
 *
 * The listener deliberately does **not** call `preventDefault()`: that would
 * suppress Chrome's own mini-infobar on Android. The parked event is still
 * promptable from our button after the banner has been shown or dismissed.
 *
 * Non-standard, Chromium-only (Chrome, Edge, Samsung Internet). Safari never
 * fires it; iOS users install from Share → Add to Home Screen.
 */

export type InstallPromptOutcome = "accepted" | "dismissed";

export type BeforeInstallPromptLike = {
  prompt: () => Promise<unknown>;
  userChoice: Promise<{ outcome: InstallPromptOutcome; platform?: string }>;
};

export type PromptInstallResult = InstallPromptOutcome | "unavailable";

export type PwaInstallSnapshot = {
  /** A parked, not-yet-used `beforeinstallprompt` event. */
  promptable: boolean;
  /** `appinstalled` fired in this page. */
  installed: boolean;
};

type InstallEventTarget = {
  addEventListener: (type: string, listener: (event: Event) => void) => void;
  removeEventListener: (type: string, listener: (event: Event) => void) => void;
};

const SERVER_SNAPSHOT: PwaInstallSnapshot = {
  promptable: false,
  installed: false,
};

let deferredPrompt: BeforeInstallPromptLike | null = null;
let snapshot: PwaInstallSnapshot = SERVER_SNAPSHOT;
const subscribers = new Set<() => void>();
let unbind: (() => void) | null = null;

function publish(next: PwaInstallSnapshot) {
  snapshot = next;
  for (const notify of subscribers) notify();
}

function isPromptLike(event: unknown): event is BeforeInstallPromptLike {
  return (
    typeof event === "object" &&
    event !== null &&
    typeof (event as { prompt?: unknown }).prompt === "function"
  );
}

/**
 * Bind once per page. Returns an unbind for effect cleanup; the parked event
 * survives unbind so a React strict-mode remount cannot lose it.
 */
export function bindPwaInstallListeners(
  target: InstallEventTarget | undefined = typeof window === "undefined"
    ? undefined
    : window,
): () => void {
  if (!target || unbind) return unbind ?? (() => {});

  const onBeforeInstallPrompt = (event: Event) => {
    if (!isPromptLike(event)) return;
    deferredPrompt = event;
    publish({ promptable: true, installed: false });
  };

  const onAppInstalled = () => {
    deferredPrompt = null;
    publish({ promptable: false, installed: true });
  };

  target.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  target.addEventListener("appinstalled", onAppInstalled);

  unbind = () => {
    target.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    target.removeEventListener("appinstalled", onAppInstalled);
    unbind = null;
  };
  return unbind;
}

export function getPwaInstallSnapshot(): PwaInstallSnapshot {
  return snapshot;
}

export function subscribePwaInstall(notify: () => void): () => void {
  subscribers.add(notify);
  return () => {
    subscribers.delete(notify);
  };
}

/**
 * Show the native install prompt from the parked event. One-shot: Chromium
 * rejects a second `prompt()` on the same event, so the event is dropped
 * whatever the user chose.
 */
export async function promptPwaInstall(): Promise<PromptInstallResult> {
  const prompt = deferredPrompt;
  if (!prompt) return "unavailable";
  deferredPrompt = null;
  publish({ promptable: false, installed: snapshot.installed });

  try {
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    return outcome;
  } catch {
    // A rejected prompt (gesture expired, already installed) is a dismissal —
    // the event is spent either way.
    return "dismissed";
  }
}

/** Test seam — the module is a singleton by design. */
export function resetPwaInstallStateForTests() {
  unbind?.();
  deferredPrompt = null;
  snapshot = SERVER_SNAPSHOT;
  subscribers.clear();
}

/**
 * `canInstall` is true only while a prompt is parked **and** the page is not
 * already running as an installed app, so the menu item never shows inside
 * the WebAPK / desktop window it would install.
 */
export function usePwaInstallPrompt(): {
  canInstall: boolean;
  installed: boolean;
  promptInstall: () => Promise<PromptInstallResult>;
} {
  const current = useSyncExternalStore(
    subscribePwaInstall,
    getPwaInstallSnapshot,
    () => SERVER_SNAPSHOT,
  );
  const promptInstall = useCallback(() => promptPwaInstall(), []);
  const canInstall =
    current.promptable && !current.installed && !isInstalledDisplayMode();
  return { canInstall, installed: current.installed, promptInstall };
}
