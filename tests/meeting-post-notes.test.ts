import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { meetingHarness } from "./meeting-ai-helpers";
import { ProviderError } from "../src/main/ai/errors";
import { ChatGptProvider } from "../src/main/ai/plan/provider";
import { registration, json } from "./plan-fixtures";
import { deferred } from "./helpers";
const instances: Awaited<ReturnType<typeof meetingHarness>>[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1793196000000);
});
afterEach(async () => {
  for (const s of instances.splice(0)) await s.close();
  vi.useRealTimers();
});
async function setup(saved = true) {
  const s = await meetingHarness({ saved });
  instances.push(s);
  return s;
}
const grant = (
  s: Awaited<ReturnType<typeof setup>>,
  sharing = { microphone: true, systemAudio: true },
) => ({
  acknowledged: true,
  expected: s.post.context,
  sharing,
  minutes: 1,
  requestLimit: 1,
});
const flush = () => vi.advanceTimersByTimeAsync(0);
describe("P8.2 separate one-attempt post-meeting automation", () => {
  it("does not include earlier capture segments when a saved meeting is resumed", async () => {
    const s = await setup();
    s.stop();
    await s.recorder.flush();
    await s.recorder.resume({ id: s.saved!.id, acknowledged: true });
    s.events.splice(0);
    s.events.push({
      id: "resumed-final",
      sessionId: "capture-b",
      source: "microphone",
      state: "final",
      startMs: Date.now() - 1000,
      endMs: Date.now() - 500,
      text: "We decided to publish the checklist tomorrow.",
      model: "tiny.en",
    });
    s.setCapture({
      ...s.capture(),
      state: "ACTIVE",
      sessionId: "capture-b",
      epoch: 3,
      consent: {
        screen: false,
        microphone: true,
        systemAudio: true,
        acknowledged: true,
      },
    });
    s.recorder.observe(s.capture(), s.events);
    await vi.waitFor(() => expect(s.recorder.value.saving).toBe(true));
    await s.recorder.flush();
    s.post.authorise(grant(s));
    await s.post.end(s.stop);
    await flush();
    expect(s.mockProvider.respond).toHaveBeenCalledOnce();
    const request = s.mockProvider.respond.mock.calls[0]![0];
    expect(
      request.meetingContext!.excerpts.every(
        (excerpt) => excerpt.sessionId === "capture-b",
      ),
    ).toBe(true);
    expect(request.prompt).not.toContain("prototype on Thursday");
  });
  it("keeps capture/persistence consent distinct from automatic remote notes permission", async () => {
    const s = await setup();
    expect(s.post.value.autoGrant).toBeNull();
    expect(() =>
      s.post.authorise({ ...grant(s), acknowledged: false }),
    ).toThrow(/Acknowledge/);
    expect(() => s.post.authorise({ ...grant(s), requestLimit: 20 })).toThrow(
      /one attempt/,
    );
    await s.post.end(s.stop);
    await flush();
    expect(s.mockProvider.respond).not.toHaveBeenCalled();
    expect((await s.recorder.requireStore().get(s.saved!.id)).status).toBe(
      "ended",
    );
  });
  it("runs exactly one draft after deliberate End and closes permission without saving or repeating", async () => {
    const s = await setup();
    s.post.authorise(grant(s));
    expect(s.mockProvider.respond).not.toHaveBeenCalled();
    const id = await s.post.end(s.stop);
    await flush();
    expect(id).toBe(s.saved!.id);
    expect(s.capture().state).toBe("STOPPED");
    expect(s.mockProvider.respond).toHaveBeenCalledOnce();
    expect(s.ai.value.draft).not.toBeNull();
    expect(s.post.value.autoGrant).toBeNull();
    expect((await s.recorder.requireStore().get(id!)).summary).toBeNull();
    await s.post.end(s.stop);
    await flush();
    expect(s.mockProvider.respond).toHaveBeenCalledOnce();
  });
  it.each(["pause", "stop", "account", "source"])(
    "revokes the pending post-meeting grant on %s without starting remote work",
    async (reason) => {
      const s = await setup();
      s.post.authorise(grant(s));
      if (reason === "pause")
        s.setCapture({ ...s.capture(), state: "PAUSED", epoch: 2 });
      else if (reason === "stop") s.stop();
      else if (reason === "account") s.connection.accountId = "other-account";
      else s.capture().sources.systemAudio.state = "ERROR";
      s.post.observe();
      expect(s.post.value.autoGrant).toBeNull();
      expect(s.mockProvider.respond).not.toHaveBeenCalled();
    },
  );
  it("expires without replay/renewal, and never requests notes from empty temporary text", async () => {
    const s = await setup(false);
    s.post.authorise(grant(s));
    await vi.advanceTimersByTimeAsync(60001);
    await s.post.end(s.stop);
    await flush();
    expect(s.mockProvider.respond).not.toHaveBeenCalled();
    expect(s.post.value.autoGrant).toBeNull();
    const empty = await setup(false);
    empty.events.splice(0);
    empty.post.authorise(grant(empty));
    await empty.post.end(empty.stop);
    await flush();
    expect(empty.mockProvider.respond).not.toHaveBeenCalled();
    expect(empty.ai.value.draft).toBeNull();
    expect(empty.post.value.postStatus).toContain("No retained");
  });
  it("includes only separately shared transcript categories in automatic notes", async () => {
    const s = await setup(false);
    s.post.authorise(grant(s, { microphone: true, systemAudio: false }));
    await s.post.end(s.stop);
    await flush();
    expect(s.mockProvider.respond).toHaveBeenCalledOnce();
    const request = s.mockProvider.respond.mock.calls[0]![0];
    expect(
      request.meetingContext!.excerpts.every(
        (excerpt) => excerpt.source === "microphone",
      ),
    ).toBe(true);
    expect(request.history).toEqual([]);
    expect(request.screenshot).toBeNull();
  });
  it("does not retry offline/rate failures or switch to separately billed credentials", async () => {
    const s = await setup(false);
    s.mockProvider.respond.mockImplementationOnce(async function* () {
      throw new ProviderError("rate-limit", "Synthetic rate limit");
      yield { type: "text", text: "unreachable" };
    });
    s.post.authorise(grant(s));
    await s.post.end(s.stop);
    await flush();
    expect(s.mockProvider.respond).toHaveBeenCalledOnce();
    expect(s.ai.value.status).toBe("error");
    expect(s.post.value.autoGrant).toBeNull();
    await vi.advanceTimersByTimeAsync(120000);
    expect(s.mockProvider.respond).toHaveBeenCalledOnce();
  });
});
describe("P8.2 actual ChatGPT provider meeting guard after token renewal", () => {
  it("blocks the Responses POST if the selected stored meeting changes while awaiting a token", async () => {
    const tokenState: { gate?: ReturnType<typeof deferred<void>> } = {};
    const accounts = {
      identity: "account-a",
      registration: registration(),
      token: vi.fn(async () => {
        await tokenState.gate?.promise;
        return "synthetic-secret";
      }),
    };
    const transport = vi.fn(async (url: string) => {
      if (url.endsWith("/models"))
        return json({
          models: [
            {
              slug: "fixture-plan",
              display_name: "Fixture plan",
              visibility: "list",
              input_modalities: ["text"],
            },
          ],
        });
      throw Error(
        "A real transport must not be reached after a changed review.",
      );
    });
    const provider = new ChatGptProvider(accounts, transport);
    await provider.discoverModels();
    provider.selectModel("fixture-plan");
    const s = await meetingHarness({ provider });
    instances.push(s);
    const id = await s.ai.prepare(s.selection);
    tokenState.gate = deferred<void>();
    await s.ai.ask({ reviewId: id, acknowledged: true });
    await flush();
    const doc = await s.recorder.requireStore().get(s.saved!.id);
    doc.notes = "A deliberate edit during token renewal";
    await s.recorder.requireStore().update(doc, doc.revision, 30);
    tokenState.gate.resolve();
    await flush();
    expect(
      transport.mock.calls.filter(([url]) => url.endsWith("/responses")),
    ).toHaveLength(0);
    expect(s.ai.value.draft).toBeNull();
    expect(s.assistant.value.responses.at(-1)!.status).toBe("error");
  });
});
