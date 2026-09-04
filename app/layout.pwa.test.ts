import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Source-level guards for the installable-app surface. The manifest route
 * and the root-layout metadata are what Chrome / Safari read, so a refactor
 * that drops either silently breaks "Install app" without failing a type check.
 */
const APP_DIR = __dirname;
const layout = readFileSync(path.join(APP_DIR, "layout.tsx"), "utf8");
const proxy = readFileSync(path.join(APP_DIR, "..", "proxy.ts"), "utf8");
const accountMenu = readFileSync(
  path.join(APP_DIR, "..", "components", "account-menu.tsx"),
  "utf8",
);

describe("installable app wiring", () => {
  it("serves the manifest via the Next metadata route", () => {
    expect(existsSync(path.join(APP_DIR, "manifest.ts"))).toBe(true);
    // A hand-written public/manifest.json would be bounced by the Clerk
    // proxy and would not get the auto-injected <link rel="manifest">.
    expect(existsSync(path.join(APP_DIR, "..", "public", "manifest.json"))).toBe(
      false,
    );
  });

  it("keeps the iOS Add to Home Screen metadata in the root layout", () => {
    expect(layout).toMatch(/appleWebApp:\s*\{/);
    expect(layout).toMatch(/capable:\s*true/);
    expect(layout).toMatch(/statusBarStyle:\s*"black-translucent"/);
    expect(layout).toMatch(/title:\s*"agentnote"/);
    expect(layout).toMatch(/themeColor:\s*\[/);
  });

  it("parks beforeinstallprompt from inside the root tree", () => {
    expect(layout).toContain("<PwaInstallBoot />");
    expect(layout).toContain("@/components/pwa-install-boot");
  });

  it("lets the .webmanifest through the Clerk proxy matcher", () => {
    expect(proxy).toMatch(/webmanifest/);
  });

  it("offers Install app from the account menu", () => {
    expect(accountMenu).toContain("usePwaInstallPrompt");
    expect(accountMenu).toContain("Install app");
  });
});
