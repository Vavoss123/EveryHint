import assert from "node:assert/strict";
import {readFile,readdir,stat,writeFile} from "node:fs/promises";
import {join,resolve} from "node:path";
import {createHash} from "node:crypto";
import {listPackage,extractFile,statFile} from "@electron/asar";
import {getCurrentFuseWire,FuseV1Options as F} from "@electron/fuses";
import {verifyPublisher} from "../src/main/updates-verification.ts";
const root=resolve("release/win-unpacked"),archive=join(root,"resources/app.asar"),entries=listPackage(archive,{isPack:false}).map(p=>p.replaceAll("\\","/"));
for(const path of entries){assert.match(path,/^\/(out|node_modules|package\.json)(\/|$)/);assert.ok(!/^\/(src|tests|scripts|artifacts|docs|\.env)/.test(path));assert.ok(!/\.map$/.test(path));}
assert.ok(!entries.some(p=>p.startsWith("/node_modules/@openai/")),"Unused Codex CLI is excluded");
const manifest=JSON.parse(extractFile(archive,join("out","main","speech-runtime.json")).toString());const helper=await readFile(join(root,"resources/speech/everyhint-transcriber.exe"));assert.equal(createHash("sha256").update(helper).digest("hex"),manifest.sha256);assert.equal(helper.length,manifest.bytes);
const developerPaths=[process.cwd(),process.env.USERPROFILE].filter(Boolean).flatMap(p=>[p,p.replaceAll("\\","/")]).flatMap(p=>[Buffer.from(p),Buffer.from(p,"utf16le")]);
for(const path of entries.filter(p=>p.startsWith("/out/"))){const native=join(...path.slice(1).split("/"));if("files" in statFile(archive,native))continue;const bytes=extractFile(archive,native);for(const needle of developerPaths)assert.ok(!bytes.includes(needle),`Developer path in ${path}`);}
for(const needle of developerPaths)assert.ok(!helper.includes(needle));
assert.deepEqual((await readdir(join(root,"resources/speech"))).sort(),["everyhint-transcriber.exe","whisper-LICENSE"]);
const fuses=await getCurrentFuseWire(join(root,"EveryHint.exe"));
for(const id of [F.EnableNodeOptionsEnvironmentVariable,F.EnableNodeCliInspectArguments,F.GrantFileProtocolExtraPrivileges])assert.equal(fuses[id],48);
for(const id of [F.EnableEmbeddedAsarIntegrityValidation,F.OnlyLoadAppFromAsar])assert.equal(fuses[id],49);
const installer="release/EveryHint-0.5.0-x64-private-unsigned-setup.exe",bytes=await readFile(installer);
for(const compiled of [bytes,await readFile(join(root,"EveryHint.exe"))])for(const needle of developerPaths)assert.ok(!compiled.includes(needle),"Developer home path in Windows executable");
await assert.rejects(verifyPublisher(installer,["CN=Controlled fixture publisher"]),/valid trusted Windows publisher/);
const report={status:"passed",archiveEntries:entries.length,asarBytes:(await stat(archive)).size,helper:manifest,fuses,developerHomePathsFound:0,modelsBundled:false,installer:{path:installer,bytes:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex")},signing:"unsigned private test build; not trusted for distribution",unsignedInstallerRejectedByUpdateVerifier:true,runAsNode:"retained for optional Claude adapter compatibility"};
await writeFile("artifacts/p11-package-audit.json",JSON.stringify(report,null,2));console.log(JSON.stringify(report));
