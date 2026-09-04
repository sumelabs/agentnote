import { describe, expect, it } from "vitest";
import {
  getDisplayMode,
  INSTALLED_DISPLAY_MODES,
  isInstalledDisplayMode,
  type DisplayModeWindow,
} from "./display-mode";

function windowMatching(...modes: string[]): DisplayModeWindow {
  return {
    matchMedia: (query) => ({
      matches: modes.some((mode) => query === `(display-mode: ${mode})`),
    }),
    navigator: {},
  };
}

describe("display mode", () => {
  it("is a browser tab on the server and when nothing matches", () => {
    expect(getDisplayMode(undefined)).toBe("browser");
    expect(getDisplayMode(windowMatching())).toBe("browser");
    expect(getDisplayMode({})).toBe("browser");
    expect(isInstalledDisplayMode(undefined)).toBe(false);
    expect(isInstalledDisplayMode(windowMatching("browser"))).toBe(false);
  });

  it("reports every installed mode the manifest can ask for", () => {
    for (const mode of INSTALLED_DISPLAY_MODES) {
      expect(getDisplayMode(windowMatching(mode))).toBe(mode);
      expect(isInstalledDisplayMode(windowMatching(mode))).toBe(true);
    }
  });

  it("treats the iOS Home Screen flag as standalone even without matchMedia", () => {
    expect(getDisplayMode({ navigator: { standalone: true } })).toBe(
      "standalone",
    );
    expect(
      getDisplayMode({ ...windowMatching(), navigator: { standalone: false } }),
    ).toBe("browser");
  });

  it("survives a matchMedia that throws (partial test doubles)", () => {
    expect(
      getDisplayMode({
        matchMedia: () => {
          throw new Error("no media queries here");
        },
      }),
    ).toBe("browser");
  });
});
