import { describe, expect, it } from "vitest";
import { connectionLabel, defaultCatalogModel } from "../src/shared/connection";
import type { ProviderStatus } from "../src/shared/ai";

const provider: ProviderStatus = {
  id: "codex",
  auth: "missing",
  ready: false,
  message: "",
  capabilities: { text: true, images: false, tools: false },
  models: [],
};
describe("Readable ChatGPT readiness", () => {
  it("does not mistake a remembered signed-out registration for a connection", () => {
    expect(
      connectionLabel(provider, {
        revision: 1,
        state: "signed-out",
        message: "",
        selectedAccount: "old",
        accounts: [{ id: "old", label: "Remembered account", signedIn: false }],
      }),
    ).toBe("Not signed in");
  });
  it("distinguishes a signed-in account from model readiness", () =>
    expect(connectionLabel({ ...provider, auth: "chatgpt" })).toBe(
      "Signed in, model setup required",
    ));
  it("requires provider readiness for Ready", () =>
    expect(connectionLabel({ ...provider, auth: "chatgpt", ready: true })).toBe(
      "Ready",
    ));
  it("shows connection problems instead of Ready after an account error", () =>
    expect(
      connectionLabel(
        { ...provider, ready: true },
        { revision: 2, state: "error", message: "" },
      ),
    ).toBe("Connection problem"));
  it("shows reconnecting during an account operation", () =>
    expect(
      connectionLabel(provider, {
        revision: 3,
        state: "signing-in",
        message: "",
      }),
    ).toBe("Reconnecting"));
  it("selects only models returned by the validated catalog", () => {
    const text = { id: "verified-text", name: "Text", images: false },
      image = { id: "verified-image", name: "Image", images: true };
    expect(defaultCatalogModel()).toBeUndefined();
    expect(defaultCatalogModel([text, image])).toBe(image);
    expect(defaultCatalogModel([text])).toBe(text);
  });
});
