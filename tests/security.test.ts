import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assetPath,
  contentSecurityPolicy,
  developmentUrl,
  trustedDocument,
} from "../src/main/security";
import { parseSourceId } from "../src/shared/validation";

describe("IPC and local document security", () => {
  it("accepts only the exact trusted document", () => {
    expect(
      trustedDocument(
        "everyhint://app/index.html",
        "everyhint://app/index.html",
      ),
    ).toBe(true);
    expect(
      trustedDocument("http://127.0.0.1:5173/", "http://127.0.0.1:5173"),
    ).toBe(true);
    for (const url of [
      "everyhint://evil/index.html",
      "https://app/index.html",
      "everyhint://app/other.html",
      "not a url",
      "everyhint://app/index.html?other=1",
    ]) {
      expect(trustedDocument(url, "everyhint://app/index.html")).toBe(false);
    }
  });
  it("serves only assets contained in the application directory", () => {
    const root = resolve("test-assets");
    expect(assetPath(root, "everyhint://app/assets/main.js")).toBe(
      resolve(root, "assets/main.js"),
    );
    for (const url of [
      "everyhint://app/..%2fsecret",
      "everyhint://app/%2e%2e%5csecret",
      "everyhint://evil/index.html",
      "file:///secrets",
      "everyhint://app/%00",
    ]) {
      expect(() => assetPath(root, url)).toThrow();
    }
  });
  it("disables network access and inline/eval scripts in production CSP", () => {
    const csp = contentSecurityPolicy();
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("media-src 'none'");
  });
  it("allows the local Vite connection only in development", () => {
    expect(developmentUrl(undefined)).toBeUndefined();
    expect(developmentUrl("http://127.0.0.1:5173")).toBe(
      "http://127.0.0.1:5173/",
    );
    expect(() => developmentUrl("https://example.com")).toThrow("loopback");
    expect(() => developmentUrl("http://127.0.0.1.evil.com:5173")).toThrow(
      "loopback",
    );
    expect(contentSecurityPolicy("http://127.0.0.1:5173/")).toContain(
      "connect-src http://127.0.0.1:5173 ws://127.0.0.1:5173",
    );
  });
  it.each(["bad", "window:1:0\n", "screen:../../secret", 5, null])(
    "rejects malformed source IDs: %j",
    (id) => {
      expect(() => parseSourceId(id)).toThrow();
    },
  );
});
