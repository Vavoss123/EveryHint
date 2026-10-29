// Installed only by Playwright in an isolated Electron main process. No network
// is forwarded except the owned loopback OAuth callback. No genuine credentials.
export async function installListenPlanFixture({ shell }) {
  const crypto = process.getBuiltinModule("crypto"),
    pair = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }),
    key = pair.publicKey.export({ format: "jwk" }),
    original = globalThis.fetch;
  key.kid = "listen-fixture";
  key.alg = "RS256";
  globalThis.__listenFixture = {
    requests: [],
    calls: [],
    auth: null,
    hold: false,
    release: null,
    aborted: 0,
  };
  const client = "oaiapp_everyhint_listen_fixture",
    issuer = "https://auth.openai.com",
    resource = "https://api.openai.com/v1";
  shell.openExternal = async (raw) => {
    const url = new URL(raw);
    if (url.origin !== issuer)
      throw Error("External navigation blocked in fixture");
    globalThis.__listenFixture.auth = {
      nonce: url.searchParams.get("nonce"),
      scope: url.searchParams.get("scope"),
    };
    const callback = new URL(url.searchParams.get("redirect_uri"));
    callback.search = new URLSearchParams({
      state: url.searchParams.get("state"),
      code: "synthetic-code",
      client_id: client,
    }).toString();
    await original(callback);
  };
  const json = (value) =>
    new Response(JSON.stringify(value), {
      headers: { "content-type": "application/json" },
    });
  const sign = (payload) => {
    const base =
      Buffer.from(JSON.stringify({ alg: "RS256", kid: key.kid })).toString(
        "base64url",
      ) +
      "." +
      Buffer.from(JSON.stringify(payload)).toString("base64url");
    return (
      base +
      "." +
      crypto
        .sign("RSA-SHA256", Buffer.from(base), pair.privateKey)
        .toString("base64url")
    );
  };
  globalThis.fetch = async (raw, options = {}) => {
    const url = new URL(typeof raw === "string" ? raw : (raw.url ?? raw.href)),
      fixture = globalThis.__listenFixture;
    fixture.calls.push(url.origin + url.pathname);
    if (url.origin === issuer && url.pathname.endsWith("/jwks.json"))
      return json({ keys: [key] });
    if (url.origin === issuer && url.pathname.endsWith("/oauth/token")) {
      const now = Math.floor(Date.now() / 1000),
        common = {
          iss: issuer,
          sub: "listen-fixture-person",
          iat: now,
          exp: now + 3600,
        },
        scope = fixture.auth.scope;
      return json({
        token_type: "Bearer",
        expires_in: 3600,
        scope,
        refresh_token: "synthetic-refresh",
        id_token: sign({
          ...common,
          aud: client,
          nonce: fixture.auth.nonce,
          email: "listen@example.invalid",
        }),
        access_token: sign({
          ...common,
          aud: resource,
          client_id: client,
          scope,
        }),
      });
    }
    if (url.origin === issuer && url.pathname.endsWith("/openid-configuration"))
      return json({ issuer, revocation_endpoint: issuer + "/oauth/revoke" });
    if (url.origin === issuer && url.pathname.endsWith("/revoke"))
      return json({});
    if (url.href === resource + "/models")
      return json({
        models: [
          {
            slug: "listen-fixture-image",
            display_name: "Fixture image model",
            visibility: "list",
            input_modalities: ["text", "image"],
          },
        ],
      });
    if (url.href === resource + "/responses") {
      fixture.requests.push(JSON.parse(options.body));
      const number = fixture.requests.length;
      const encoder = new TextEncoder();
      return new Response(
        new ReadableStream({
          start(controller) {
            const send = (value) =>
              controller.enqueue(
                encoder.encode("data: " + JSON.stringify(value) + "\n\n"),
              );
            send({
              type: "response.output_text.delta",
              delta: `Fixture answer ${number}: `,
            });
            const finish = () => {
              if (options.signal?.aborted) return;
              send({
                type: "response.output_text.delta",
                delta: "grounded in supplied context.",
              });
              send({
                type: "response.completed",
                response: {
                  status: "completed",
                  model: "listen-fixture-image",
                  output: [
                    {
                      type: "message",
                      content: [
                        {
                          type: "output_text",
                          text: `Fixture answer ${number}: grounded in supplied context.`,
                        },
                      ],
                    },
                  ],
                },
              });
              controller.close();
            };
            const timer = setTimeout(() => {
              if (!fixture.hold) finish();
              else fixture.release = finish;
            }, 200);
            options.signal?.addEventListener(
              "abort",
              () => {
                clearTimeout(timer);
                fixture.aborted++;
                try {
                  controller.error(new Error("Fixture aborted"));
                } catch {
                  /* The stream may already be closed. */
                }
              },
              { once: true },
            );
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      );
    }
    throw Error(
      "Unexpected network in Listen fixture: " + url.origin + url.pathname,
    );
  };
}
