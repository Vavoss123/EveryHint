import { describe, expect, it } from "vitest";
import { CodexProvider } from "../src/main/ai/codex";
import { baseEnvironment } from "../src/main/ai/environment";

describe("provider authentication and fail-closed permissions", () => {
  it.each([
    ["Logged in using ChatGPT", "chatgpt"],
    ["Logged in using an API key - masked", "api-key"],
    ["Not logged in", "missing"],
  ])(
    "detects Codex %s using the official status command only",
    async (output, auth) => {
      const provider = new CodexProvider(async () => output);
      const status = await provider.inspect();
      expect(status.auth).toBe(auth);
      expect(status.ready).toBe(false);
      expect(status.capabilities.text).toBe(false);
      expect(() => provider.respond()).toThrow("deny-all");
    },
  );
  it("reports Codex CLI failure without exposing stderr or credentials", async () => {
    const provider = new CodexProvider(async () => {
      throw new Error("secret");
    });
    const status = await provider.inspect();
    expect(status.auth).toBe("error");
    expect(status.message).not.toContain("secret");
  });
  it("allowlists process environment and strips endpoint, subscription, cloud and unrelated secrets", () => {
    const env = baseEnvironment({
      Path: "path",
      SYSTEMROOT: "windows",
      ANTHROPIC_BASE_URL: "evil",
      OPENAI_API_KEY: "secret",
      CLAUDE_CODE_OAUTH_TOKEN: "secret",
      CUSTOM_SECRET: "secret",
      NODE_OPTIONS: "--require evil",
      AWS_ACCESS_KEY_ID: "secret",
    });
    expect(env).toEqual({ Path: "path", SYSTEMROOT: "windows" });
  });
});
