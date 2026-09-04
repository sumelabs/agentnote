/**
 * Installed-app display mode.
 *
 * "Installed" means the document is running inside an app window — a WebAPK /
 * desktop PWA (`display-mode` media query) or an iOS Home Screen web app
 * (`navigator.standalone`).
 */

export type DisplayMode =
  | "standalone"
  | "minimal-ui"
  | "fullscreen"
  | "window-controls-overlay"
  | "browser";

/** Every mode a manifest can request; `browser` is the tab fallback. */
export const INSTALLED_DISPLAY_MODES = [
  "standalone",
  "minimal-ui",
  "fullscreen",
  "window-controls-overlay",
] as const satisfies readonly DisplayMode[];

export type DisplayModeWindow = {
  matchMedia?: (query: string) => { matches: boolean };
  navigator?: { standalone?: boolean };
};

function defaultWindow(): DisplayModeWindow | undefined {
  return typeof window === "undefined"
    ? undefined
    : (window as unknown as DisplayModeWindow);
}

export function getDisplayMode(
  win: DisplayModeWindow | undefined = defaultWindow(),
): DisplayMode {
  if (!win) return "browser";

  // iOS Home Screen web apps do not always report `display-mode`; Safari's
  // non-standard flag is the reliable signal there.
  if (win.navigator?.standalone === true) return "standalone";

  for (const mode of INSTALLED_DISPLAY_MODES) {
    try {
      if (win.matchMedia?.(`(display-mode: ${mode})`)?.matches) return mode;
    } catch {
      // A stubbed or partial matchMedia is a browser tab, not a crash.
    }
  }
  return "browser";
}

export function isInstalledDisplayMode(
  win: DisplayModeWindow | undefined = defaultWindow(),
): boolean {
  return getDisplayMode(win) !== "browser";
}
