import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import path from "node:path";
import { describe, expect, it } from "vitest";
import manifest, {
  PWA_APP_ID,
  PWA_ICONS,
  PWA_SCOPE,
  PWA_START_URL,
  PWA_THEME_COLOR,
} from "./manifest";

const PUBLIC_DIR = path.resolve(__dirname, "..", "public");

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

type PngInfo = {
  width: number;
  height: number;
  colorType: number;
  /** True when every pixel is fully opaque (or the file has no alpha at all). */
  opaque: boolean;
};

/** Just enough PNG parsing to check IHDR size and alpha coverage. */
function readPng(file: string): PngInfo {
  const buf = readFileSync(file);
  expect(buf.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idat.push(data);
    }
    offset += 12 + length;
  }
  expect(bitDepth).toBe(8);

  // Colour types 4 (grey+alpha) and 6 (RGBA) carry alpha; 0 / 2 are opaque.
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType as 0 | 2 | 4 | 6];
  expect(channels).toBeDefined();
  if (colorType !== 4 && colorType !== 6) {
    return { width, height, colorType, opaque: true };
  }

  // Unfilter enough to inspect alpha: filter type 0 only, which is what our
  // generator writes; anything else fails loudly rather than passing silently.
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels! + 1;
  for (let y = 0; y < height; y++) {
    expect(raw[y * stride]).toBe(0);
    for (let x = 0; x < width; x++) {
      const alpha = raw[y * stride + 1 + x * channels! + (channels! - 1)];
      if (alpha !== 255) return { width, height, colorType, opaque: false };
    }
  }
  return { width, height, colorType, opaque: true };
}

describe("web app manifest", () => {
  const output = manifest();

  it("has a permanent id, whole-origin scope and a safe start_url", () => {
    expect(PWA_APP_ID).toBe("/");
    expect(PWA_SCOPE).toBe("/");
    // Never a `/n/{id}` note path: note ids rotate.
    expect(PWA_START_URL).toMatch(/^\/(\?.*)?$/);
    expect(output.id).toBe(PWA_APP_ID);
    expect(output.scope).toBe(PWA_SCOPE);
    expect(output.start_url).toBe(PWA_START_URL);
  });

  it("is a standalone dark-themed app without an orientation lock", () => {
    expect(output.name).toBe("agentnote");
    expect(output.short_name).toBe("agentnote");
    expect(output.display).toBe("standalone");
    expect(output.theme_color).toBe(PWA_THEME_COLOR);
    expect(output.background_color).toBe(PWA_THEME_COLOR);
    expect(PWA_THEME_COLOR).toBe("#141414");
    expect(output.orientation).toBeUndefined();
    expect(output.prefer_related_applications).toBe(false);
    expect(output.related_applications).toBeUndefined();
  });

  it("declares 192 + 512 PNG icons for both `any` and `maskable`", () => {
    const byPurpose = (purpose: string) =>
      PWA_ICONS.filter((icon) => icon.purpose === purpose).map(
        (icon) => icon.sizes,
      );
    expect(byPurpose("any")).toEqual(
      expect.arrayContaining(["192x192", "512x512"]),
    );
    expect(byPurpose("maskable")).toEqual(
      expect.arrayContaining(["192x192", "512x512"]),
    );
    for (const icon of PWA_ICONS) {
      expect(icon.type).toBe("image/png");
      expect(icon.src).toMatch(/^\/pwa\/.+\.png$/);
      // Never combine purposes — Chrome and Lighthouse treat `any maskable`
      // as a maskable-only render and shrink the mark.
      expect(icon.purpose).toMatch(/^(any|maskable)$/);
    }
  });

  it("ships every icon file at its declared size, and maskable icons opaque", () => {
    for (const icon of PWA_ICONS) {
      const info = readPng(path.join(PUBLIC_DIR, icon.src));
      const [width, height] = icon.sizes!.split("x").map(Number);
      expect(info.width, icon.src).toBe(width);
      expect(info.height, icon.src).toBe(height);
      if (icon.purpose === "maskable") {
        expect(info.opaque, `${icon.src} must have no transparent pixels`).toBe(
          true,
        );
      }
    }
  });
});
