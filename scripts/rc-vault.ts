// Only this run's synthetic identity-only registrations/keys; never real accounts.
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { AsyncEntry } from "@napi-rs/keyring";
import { KeyringVault } from "../src/main/ai/plan/vault";
import { historyProfile } from "../src/main/meetings/keys";
const [action, input] = process.argv.slice(2);
if (!input) throw Error("Expected an owned RC fixture directory.");
const home = resolve(input);
if (dirname(home) !== resolve(tmpdir()) || !basename(home).startsWith("everyhint-rc-"))
  throw Error("Refusing a non-fixture credential scope.");
const vault = KeyringVault.forInstallation(join(home, "chatgpt-plan"));
if (action === "seed") {
  const ids = [randomUUID(), randomUUID()];
  await writeFile(join(home, "fixture-accounts.json"), JSON.stringify(ids), { flag: "wx" });
  await vault.write(JSON.stringify({ version: 1, hostId: `urn:uuid:${randomUUID()}`, selected: ids[0],
    registrations: ids.map((id, index) => ({ id, issuer: "https://auth.openai.com", clientId: `rc-fixture-${index}`,
      subject: `identity-fixture-${index}`, email: `rc-${index}@example.invalid`,
      tokens: { accessToken: "RC-NOT-A-REAL-TOKEN", idToken: "RC-NOT-A-REAL-TOKEN", refreshToken: null,
        scopes: ["openid"], expiresAt: Date.now()+3600000, earliestRefreshAt: 0 } })) }));
} else if (action === "clear") {
  const ids = JSON.parse(await readFile(join(home, "fixture-accounts.json"), "utf8")) as string[];
  if (ids.length !== 2 || ids.some(id => !/^[a-f0-9-]{36}$/.test(id))) throw Error("Invalid fixture IDs.");
  await vault.clear();
  for (const id of [...ids, null])
    for (const service of ["EveryHint.Meetings.v1", "EveryHint.Personal.v1", "EveryHint.Context.v1"])
      await new AsyncEntry(service, historyProfile(home, id)).deleteCredential();
} else throw Error("Unknown fixture operation.");
