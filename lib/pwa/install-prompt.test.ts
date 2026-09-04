import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bindPwaInstallListeners,
  getPwaInstallSnapshot,
  promptPwaInstall,
  resetPwaInstallStateForTests,
  subscribePwaInstall,
  type BeforeInstallPromptLike,
} from "./install-prompt";

type Listener = (event: Event) => void;

/** Minimal EventTarget double — the module only needs add/remove + dispatch. */
function fakeTarget() {
  const listeners = new Map<string, Set<Listener>>();
  return {
    addEventListener: vi.fn((type: string, listener: Listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    }),
    removeEventListener: vi.fn((type: string, listener: Listener) => {
      listeners.get(type)?.delete(listener);
    }),
    dispatch(type: string, event: unknown = {}) {
      for (const listener of listeners.get(type) ?? []) {
        listener(event as Event);
      }
    },
    count(type: string) {
      return listeners.get(type)?.size ?? 0;
    },
  };
}

function promptEvent(
  outcome: "accepted" | "dismissed" = "accepted",
): BeforeInstallPromptLike & { preventDefault: ReturnType<typeof vi.fn> } {
  return {
    preventDefault: vi.fn(),
    prompt: vi.fn(async () => undefined),
    userChoice: Promise.resolve({ outcome, platform: "web" }),
  };
}

describe("beforeinstallprompt store", () => {
  beforeEach(() => {
    resetPwaInstallStateForTests();
  });

  afterEach(() => {
    resetPwaInstallStateForTests();
    vi.clearAllMocks();
  });

  it("starts unpromptable and is a no-op without a window", () => {
    expect(getPwaInstallSnapshot()).toEqual({
      promptable: false,
      installed: false,
    });
    const unbind = bindPwaInstallListeners(undefined);
    expect(typeof unbind).toBe("function");
    expect(getPwaInstallSnapshot().promptable).toBe(false);
  });

  it("parks the event without preventDefault so Chrome's own banner still shows", async () => {
    const target = fakeTarget();
    bindPwaInstallListeners(target);
    const notify = vi.fn();
    subscribePwaInstall(notify);

    const event = promptEvent();
    target.dispatch("beforeinstallprompt", event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(getPwaInstallSnapshot()).toEqual({
      promptable: true,
      installed: false,
    });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(await promptPwaInstall()).toBe("accepted");
  });

  it("ignores events that are not promptable", () => {
    const target = fakeTarget();
    bindPwaInstallListeners(target);
    target.dispatch("beforeinstallprompt", { preventDefault() {} });
    expect(getPwaInstallSnapshot().promptable).toBe(false);
  });

  it("binds once; unbind removes listeners but keeps the parked event (strict-mode remount)", () => {
    const target = fakeTarget();
    const first = bindPwaInstallListeners(target);
    const second = bindPwaInstallListeners(target);
    expect(second).toBe(first);
    expect(target.count("beforeinstallprompt")).toBe(1);
    expect(target.count("appinstalled")).toBe(1);

    target.dispatch("beforeinstallprompt", promptEvent());
    first();
    expect(target.count("beforeinstallprompt")).toBe(0);
    expect(getPwaInstallSnapshot().promptable).toBe(true);

    bindPwaInstallListeners(target);
    expect(target.count("beforeinstallprompt")).toBe(1);
  });

  it("prompts once, reports the choice, and spends the event", async () => {
    const target = fakeTarget();
    bindPwaInstallListeners(target);
    const event = promptEvent("dismissed");
    target.dispatch("beforeinstallprompt", event);

    await expect(promptPwaInstall()).resolves.toBe("dismissed");
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(getPwaInstallSnapshot().promptable).toBe(false);

    await expect(promptPwaInstall()).resolves.toBe("unavailable");
    expect(event.prompt).toHaveBeenCalledTimes(1);
  });

  it("treats a rejected prompt() as a dismissal", async () => {
    const target = fakeTarget();
    bindPwaInstallListeners(target);
    const event = promptEvent();
    event.prompt = vi.fn(async () => {
      throw new Error("prompt() already called");
    });
    target.dispatch("beforeinstallprompt", event);

    await expect(promptPwaInstall()).resolves.toBe("dismissed");
  });

  it("clears the parked event and flags installed on appinstalled", () => {
    const target = fakeTarget();
    bindPwaInstallListeners(target);
    const notify = vi.fn();
    subscribePwaInstall(notify);
    target.dispatch("beforeinstallprompt", promptEvent());
    target.dispatch("appinstalled");

    expect(getPwaInstallSnapshot()).toEqual({
      promptable: false,
      installed: true,
    });
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it("unsubscribes cleanly", () => {
    const target = fakeTarget();
    bindPwaInstallListeners(target);
    const notify = vi.fn();
    const unsubscribe = subscribePwaInstall(notify);
    unsubscribe();
    target.dispatch("beforeinstallprompt", promptEvent());
    expect(notify).not.toHaveBeenCalled();
  });
});
