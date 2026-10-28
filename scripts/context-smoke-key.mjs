import { AsyncEntry } from "@napi-rs/keyring";
import { createHash } from "node:crypto";
import { basename, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
const home = resolve(process.argv[2]);
if (
  dirname(home) !== resolve(tmpdir()) ||
  !basename(home).startsWith("everyhint-p10-ui-")
)
  throw Error("Expected isolated P10 smoke profile.");
const profile = createHash("sha256")
  .update(
    `${process.platform === "win32" ? home.toLowerCase() : home}\0local-only`,
  )
  .digest("hex");
for (const service of [
  "EveryHint.Context.v1",
  "EveryHint.Personal.v1",
  "EveryHint.Meetings.v1",
])
  await new AsyncEntry(service, profile).deleteCredential();
// Remove only manifests/chunks belonging to this unique isolated test profile.
for (const service of ["calendar", "contacts"]) {
  const owner = createHash("sha256")
      .update(`${profile}/${service}`)
      .digest("hex"),
    entry = (slot) =>
      new AsyncEntry("EveryHint.GoogleOAuth.v1", `${owner}/${slot}`),
    bytes = await entry("manifest").getSecret();
  if (bytes) {
    const m = JSON.parse(Buffer.from(bytes).toString());
    if (
      !/^[a-f0-9-]{36}$/.test(m.generation) ||
      !Number.isInteger(m.count) ||
      m.count < 1 ||
      m.count > 66
    )
      throw Error("Invalid test vault manifest");
    await entry("manifest").deleteCredential();
    for (let i = 0; i < m.count; i++)
      await entry(`${m.generation}/${i}`).deleteCredential();
  }
}
