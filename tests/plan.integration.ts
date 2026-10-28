import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { AssistantController } from "../src/main/ai/controller";
import { ChatGptAccounts } from "../src/main/ai/plan/accounts";
import { ChatGptProvider } from "../src/main/ai/plan/provider";
import { OpenAIOAuth } from "../src/main/ai/plan/oauth";
import { KeyringVault } from "../src/main/ai/plan/vault";
import { CaptureSessionController } from "../src/main/session";
import {
  DEFAULT_CONTEXT,
  type AIProvider,
  type ProviderStatus,
} from "../src/shared/ai";
import type { TranscriptEvent } from "../src/shared/transcription";
import { backend, consent, frame } from "./helpers";
import { clientId, grant, jwks, MemoryVault } from "./plan-fixtures";

const homes: string[] = [],
  servers: Server[] = [],
  actors: ChatGptAccounts[] = [],
  controllers: AssistantController[] = [];
afterEach(async () => {
  for (const controller of controllers.splice(0)) await controller.dispose();
  for (const actor of actors.splice(0)) actor.dispose();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  for (const home of homes.splice(0)) {
    if (!resolve(home).startsWith(resolve(tmpdir()) + sep))
      throw new Error("Unsafe test cleanup.");
    await rm(home, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 50,
    });
  }
});
const home = async () => {
  const path = await mkdtemp(join(tmpdir(), "everyhint-plan-integration-"));
  homes.push(path);
  return path;
};
describe("real local HTTP and native OS credential integration (no OpenAI calls)", () => {
  it("round-trips and rotates chunked synthetic credentials in the actual Windows credential store", async () => {
    const vault = KeyringVault.forInstallation(await home());
    try {
      expect(await vault.read()).toBeNull();
      const secret = JSON.stringify({ fixtureOnly: "🦊".repeat(3000) });
      await vault.write(secret);
      expect(await vault.read()).toBe(secret);
      await vault.write("rotated synthetic fixture");
      expect(await vault.read()).toBe("rotated synthetic fixture");
    } finally {
      await vault.clear();
    }
    expect(await vault.read()).toBeNull();
  });
  it.each([
    { microphone: false, systemAudio: false, screenshot: false },
    { microphone: true, systemAudio: false, screenshot: false },
    { microphone: false, systemAudio: true, screenshot: false },
    { microphone: true, systemAudio: true, screenshot: true },
  ])(
    "performs the real OAuth/JWT → catalog → frozen review → HTTP SSE pipeline with selected context %j",
    async (options) => {
      const requests: {
        path: string;
        headers: import("node:http").IncomingHttpHeaders;
        body: string;
      }[] = [];
      let nonce = "";
      const server = createServer((request, response) => {
        void (async () => {
          const parts: Buffer[] = [];
          for await (const part of request) parts.push(Buffer.from(part));
          const body = Buffer.concat(parts).toString("utf8");
          requests.push({ path: request.url!, headers: request.headers, body });
          response.setHeader("content-type", "application/json");
          if (request.url!.endsWith("jwks.json"))
            response.end(JSON.stringify(await jwks()));
          else if (request.url === "/api/accounts/oauth/token")
            response.end(JSON.stringify(await grant(nonce)));
          else if (request.url === "/v1/models")
            response.end(
              JSON.stringify({
                models: [
                  {
                    slug: "fixture-vision",
                    display_name: "Fixture Vision",
                    visibility: "list",
                    input_modalities: ["text", "image"],
                  },
                ],
              }),
            );
          else if (request.url === "/v1/responses") {
            response.setHeader("content-type", "text/event-stream");
            response.write(
              `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "Local " })}\n\n`,
            );
            response.write(
              `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "fixture 🦊" })}\n\n`,
            );
            response.end(
              `data: ${JSON.stringify({ type: "response.completed", response: { status: "completed", model: "fixture-vision", output: [{ type: "message", content: [{ type: "output_text", text: "Local fixture 🦊" }] }], usage: { input_tokens: 12, output_tokens: 4 } } })}\n\n`,
            );
          } else response.writeHead(404).end("{}");
        })().catch(() => response.writeHead(500).end("{}"));
      });
      servers.push(server);
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
      );
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("Missing listener.");
      // Only this test injects a local transport. Production pins both OpenAI origins.
      const transport = (url: string, init?: RequestInit) =>
        fetch(`http://127.0.0.1:${address.port}${new URL(url).pathname}`, init);
      const browser = vi.fn(async (_url: string) => {
          void _url;
        }),
        vault = new MemoryVault(),
        root = await home();
      const accounts = new ChatGptAccounts(root, () => {}, browser, {
        vault,
        oauth: new OpenAIOAuth(transport),
      });
      actors.push(accounts);
      await accounts.restore();
      const provider = new ChatGptProvider(accounts, transport);
      await provider.inspect();
      expect(requests).toHaveLength(0);
      await accounts.signIn();
      const authorization = new URL(browser.mock.calls[0]![0]);
      nonce = authorization.searchParams.get("nonce")!;
      const callback = new URL(authorization.searchParams.get("redirect_uri")!);
      callback.search = new URLSearchParams({
        state: authorization.searchParams.get("state")!,
        code: "synthetic-code",
        client_id: clientId,
      }).toString();
      expect((await fetch(callback)).status).toBe(200);
      expect(accounts.value.planUsage).toBe(true);
      expect(
        requests.filter((item) => item.path === "/v1/responses"),
      ).toHaveLength(0);
      const exchange = new URLSearchParams(
        requests.find((item) => item.path.endsWith("/token"))!.body,
      );
      expect(exchange.get("redirect_uri")).toBe(
        authorization.searchParams.get("redirect_uri"),
      );
      expect(exchange.get("client_id")).toBe(clientId);
      await provider.discoverModels();
      expect((await provider.inspect()).ready).toBe(false);
      provider.selectModel("fixture-vision");
      const now = Date.now(),
        capture = {
          ...new CaptureSessionController(
            backend(),
            () => 3000,
            () => {},
          ).value,
          sessionId: "fixture-capture",
          consent: { ...consent, microphone: true, systemAudio: true },
          frame: { ...frame, capturedAt: now },
        };
      const transcripts: TranscriptEvent[] = (
        ["microphone", "systemAudio"] as const
      ).map((source) => ({
        id: source,
        sessionId: capture.sessionId,
        source,
        startMs: now - 2000,
        endMs: now - 1000,
        state: "final",
        text:
          source === "microphone"
            ? "selected mic fixture"
            : "selected system fixture",
        model: "tiny.en",
      }));
      const unusedClaude: AIProvider = {
        id: "claude",
        inspect: vi.fn(
          async (): Promise<ProviderStatus> => ({
            id: "claude",
            auth: "missing",
            ready: false,
            message: "Fixture only; no billing.",
            capabilities: { text: false, images: false, tools: false },
            models: [],
          }),
        ),
        respond: vi.fn(),
        dispose() {},
      };
      const assistant = new AssistantController(
        [provider, unusedClaude],
        () => ({ capture, events: transcripts }),
        () => {},
      );
      controllers.push(assistant);
      await assistant.inspect();
      assistant.prepare({
        question: "Explicit synthetic question.",
        options: { ...DEFAULT_CONTEXT, ...options },
      });
      const review = assistant.value.review!;
      expect(review.model).toBe("fixture-vision");
      expect(
        requests.filter((item) => item.path === "/v1/responses"),
      ).toHaveLength(0);
      await assistant.ask({ reviewId: review.requestId, acknowledged: true });
      await vi.waitFor(() =>
        expect(assistant.value.responses[0]?.status).toBe("completed"),
      );
      const sent = requests.filter((item) => item.path === "/v1/responses");
      expect(sent).toHaveLength(1);
      const body = JSON.parse(sent[0]!.body);
      expect(body.input[0].content[0].text).toBe(review.prompt);
      expect(review.prompt.includes("selected mic fixture")).toBe(
        options.microphone,
      );
      expect(review.prompt.includes("selected system fixture")).toBe(
        options.systemAudio,
      );
      expect(
        body.input[0].content.filter(
          (part: { type: string }) => part.type === "input_image",
        ),
      ).toHaveLength(options.screenshot ? 1 : 0);
      expect(body).toMatchObject({
        store: false,
        stream: true,
        tools: [],
        tool_choice: "none",
      });
      expect(assistant.value.responses[0]).toMatchObject({
        text: "Local fixture 🦊",
        status: "completed",
        model: "fixture-vision",
      });
      expect(unusedClaude.respond).not.toHaveBeenCalled();
      await vi.waitFor(() =>
        expect(
          assistant.value.providers.find((item) => item.id === "codex")!
            .message,
        ).toContain("response completed"),
      );
      expect(await readdir(root)).toEqual(["host-id"]);
      expect(JSON.stringify(accounts.value)).not.toContain("access_token");
      expect(JSON.stringify(assistant.value)).not.toContain("refresh_token");
    },
  );
});
