import { AsyncEntry } from "@napi-rs/keyring";
import { createHash } from "node:crypto";
import { basename, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
const home = resolve(process.argv[2]);
if (
  dirname(home) !== resolve(tmpdir()) ||
  !basename(home).startsWith("everyhint-p9-ui-")
)
  throw Error("Expected isolated P9 smoke profile.");
const profile = createHash("sha256")
  .update(
    `${process.platform === "win32" ? home.toLowerCase() : home}\0local-only`,
  )
  .digest("hex");
await new AsyncEntry("EveryHint.Personal.v1", profile).deleteCredential();
