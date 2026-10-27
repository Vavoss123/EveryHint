import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type {
  AIProvider,
  ProviderEvent,
  ProviderStatus,
} from "../../shared/ai";
import { ProviderError } from "./errors";
import { baseEnvironment } from "./environment";

const limitation =
  "Codex inference is disabled: SDK 0.164.0 cannot enforce a deny-all tool policy. Read-only mode still permits commands. No request or API fallback will be made.";
export type LoginProbe = () => Promise<string>;
export function codexExecutable(): string {
  const require = createRequire(import.meta.url);
  const platform = process.platform;
  const arch = process.arch;
  const target =
    platform === "win32"
      ? `${arch === "arm64" ? "aarch64" : "x86_64"}-pc-windows-msvc`
      : platform === "darwin"
        ? `${arch === "arm64" ? "aarch64" : "x86_64"}-apple-darwin`
        : `${arch === "arm64" ? "aarch64" : "x86_64"}-unknown-linux-musl`;
  const packagePath = require.resolve(
    `@openai/codex-${platform}-${arch}/package.json`,
  );
  return join(
    dirname(packagePath),
    "vendor",
    target,
    "bin",
    platform === "win32" ? "codex.exe" : "codex",
  );
}
export async function localCodexLogin(): Promise<string> {
  const env = baseEnvironment();
  if (process.env.CODEX_HOME) env.CODEX_HOME = process.env.CODEX_HOME;
  return new Promise((resolve, reject) => {
    execFile(
      codexExecutable(),
      ["login", "status"],
      { env, windowsHide: true, timeout: 5000, maxBuffer: 16384 },
      (error, stdout, stderr) => {
        const status = `${stdout}\n${stderr}`;
        // Only the official status command is inspected. Never read auth.json or token stores.
        if (
          /logged in using chatgpt|logged in using an api key|not logged in/i.test(
            status,
          )
        )
          resolve(status);
        else if (error)
          reject(new Error("Codex login status could not be inspected."));
        else resolve(status);
      },
    );
  });
}
export class CodexProvider implements AIProvider {
  readonly id = "codex" as const;
  constructor(private readonly probe: LoginProbe = localCodexLogin) {}
  async inspect(): Promise<ProviderStatus> {
    const base = {
      id: this.id,
      ready: false,
      capabilities: { text: false, images: false, tools: false as const },
      models: [],
    };
    try {
      const status = await this.probe();
      if (/logged in using chatgpt/i.test(status))
        return {
          ...base,
          auth: "chatgpt",
          message: `Signed in with ChatGPT. ${limitation}`,
        };
      if (/logged in using an api key/i.test(status))
        return {
          ...base,
          auth: "api-key",
          message: `Codex uses separately billed API authentication. EveryHint will not use it. For subscription use, run codex login. ${limitation}`,
        };
      return {
        ...base,
        auth: "missing",
        message: `Not connected. Sign in with the official codex login command outside EveryHint. ${limitation}`,
      };
    } catch {
      return {
        ...base,
        auth: "error",
        message: `Could not inspect Codex login. Check the installed SDK/CLI. ${limitation}`,
      };
    }
  }
  respond(): AsyncIterable<ProviderEvent> {
    // Deliberately no SDK execution, temporary image or agent process on this path.
    throw new ProviderError("permissions", limitation);
  }
  dispose(): void {}
}
