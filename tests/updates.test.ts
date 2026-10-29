import {generateKeyPairSync,sign} from "node:crypto";
import {describe,it,expect,vi} from "vitest";
import {UpdateController,type UpdatePort} from "../src/main/updates";
import {updatePolicy,releasePayload,verifiedRelease,authenticatedRelease} from "../src/main/updates-policy";
import {deferred} from "./helpers";
const keys=generateKeyPairSync("ed25519");
const input={enabled:true,feedUrl:"https://releases.example.org/everyhint/",publisherNames:["Fixture Publisher"],manifestPublicKey:keys.publicKey.export({type:"spki",format:"pem"}).toString()};
const policy=updatePolicy(input)!;
function manifest(version="0.6.0"){
 const value={version,files:[{url:`EveryHint-${version}-x64-setup.exe`,sha512:Buffer.alloc(64,3).toString("base64"),size:100}],everyhintSignature:""};
 value.everyhintSignature=sign(null,Buffer.from(releasePayload(value)),keys.privateKey).toString("base64");return value;
}
function setup(prepare=async()=>true){
 const port:UpdatePort={check:vi.fn(async()=>({available:true,info:manifest()})),download:vi.fn(async progress=>{progress(25);progress(100);}),verifyDownloaded:vi.fn(async()=>{}),install:vi.fn(),cancel:vi.fn(),dispose:vi.fn()};
 const factory=vi.fn(()=>port),changed=vi.fn(),prepareInstall=vi.fn(prepare),controller=new UpdateController(policy,"0.5.0",factory,changed,prepareInstall);
 return{port,factory,changed,prepareInstall,controller};
}
describe("manual signed Windows release updates",()=>{
 it("does no network or updater construction until an authenticated policy and explicit check exist",async()=>{
  const factory=vi.fn();const c=new UpdateController(null,"0.5.0",factory,()=>{},async()=>true);
  expect(c.value.state).toBe("unconfigured");await expect(c.command("check")).rejects.toThrow("not configured");expect(factory).not.toHaveBeenCalled();
  const s=setup();expect(s.factory).not.toHaveBeenCalled();await expect(s.controller.command("https://evil.invalid" as "check")).rejects.toThrow("Unknown");expect(s.factory).not.toHaveBeenCalled();
 });
 it("requires HTTPS, pinned publishers and an Ed25519 key in bundled policy",()=>{
  expect(updatePolicy(input)).not.toBeNull();
  for(const patch of [{enabled:false},{feedUrl:"http://releases.example.org"},{feedUrl:"https://user:password@releases.example.org"},{feedUrl:"https://127.0.0.1"},{publisherNames:[]},{manifestPublicKey:"not a key"},{manifestPublicKey:keys.privateKey.export({type:"pkcs8",format:"pem"}).toString()},{manifestPublicKey:input.manifestPublicKey+keys.privateKey.export({type:"pkcs8",format:"pem"}).toString()}])expect(updatePolicy({...input,...patch})).toBeNull();
 });
 it("authenticates real signatures and rejects unsigned/tampered/downgrade/prerelease/foreign/web installers",()=>{
  expect(verifiedRelease(manifest(),policy,"0.5.0").version).toBe("0.6.0");
  expect(()=>verifiedRelease({...manifest(),version:"0.7.0"},policy,"0.5.0")).toThrow("authentication");
  expect(()=>verifiedRelease({...manifest(),everyhintSignature:""},policy,"0.5.0")).toThrow("authentication");
  expect(()=>verifiedRelease(manifest("0.4.0"),policy,"0.5.0")).toThrow("newer");
  for(const patch of [{version:"0.6.0-beta.1"},{files:[{...manifest().files[0],url:"https://foreign.invalid/payload.exe"}]},{files:[{...manifest().files[0],isAdminRightsRequired:true}]},{packages:{x64:{}}}])expect(()=>authenticatedRelease({...manifest(),...patch},policy)).toThrow();
 });
 it("keeps check, verified download and confirmed restart as separate user actions",async()=>{
  const s=setup();await s.controller.command("check");expect(s.controller.value).toMatchObject({state:"available",availableVersion:"0.6.0"});expect(s.port.download).not.toHaveBeenCalled();
  await s.controller.command("download");expect(s.controller.value).toMatchObject({state:"downloaded",progress:100});expect(s.port.verifyDownloaded).toHaveBeenCalledOnce();expect(s.port.install).not.toHaveBeenCalled();
  await s.controller.command("install");expect(s.prepareInstall).toHaveBeenCalledOnce();expect(s.port.verifyDownloaded).toHaveBeenCalledTimes(3);expect(s.port.install).toHaveBeenCalledOnce();
 });
 it("never downloads unauthenticated metadata and authenticates current-version results too",async()=>{
  const s=setup();vi.mocked(s.port.check).mockResolvedValueOnce({available:true,info:{...manifest(),version:"9.9.9"}});await s.controller.command("check");expect(s.controller.value.state).toBe("error");await expect(s.controller.command("download")).rejects.toThrow();expect(s.port.download).not.toHaveBeenCalled();
  vi.mocked(s.port.check).mockResolvedValueOnce({available:false,info:manifest("0.5.0")});await s.controller.command("check");expect(s.controller.value.state).toBe("current");
 });
 it("does not install after integrity/publisher failure or when restart is postponed",async()=>{
  const s=setup(async()=>false);await s.controller.command("check");await s.controller.command("download");await s.controller.command("install");expect(s.controller.value.state).toBe("downloaded");expect(s.port.install).not.toHaveBeenCalled();
  vi.mocked(s.port.verifyDownloaded).mockRejectedValueOnce(Error("sensitive path and certificate details"));await s.controller.command("install");expect(s.controller.value.state).toBe("error");expect(s.controller.value.message).not.toContain("sensitive");expect(s.port.install).not.toHaveBeenCalled();
 });
 it("rejects overlapping work and suppresses cancelled late check/download/progress",async()=>{
  const s=setup(),pending=deferred<{available:boolean;info:unknown}>();vi.mocked(s.port.check).mockReturnValueOnce(pending.promise);
  const run=s.controller.command("check");await expect(s.controller.command("check")).rejects.toThrow("already");await s.controller.command("cancel");expect(s.controller.value.state).toBe("cancelling");pending.resolve({available:true,info:manifest()});await run;expect(s.controller.value.state).toBe("idle");
  await s.controller.command("check");const download=deferred<void>();let progress:((n:number)=>void)|undefined;vi.mocked(s.port.download).mockImplementationOnce(p=>{progress=p;return download.promise;});const transfer=s.controller.command("download");await s.controller.command("cancel");progress?.(95);download.resolve();await transfer;expect(s.controller.value).toMatchObject({state:"idle",progress:null,availableVersion:null});expect(s.port.install).not.toHaveBeenCalled();
 });
 it("disposal cancels the adapter and prevents a late request from enabling installation",async()=>{
  const s=setup(),pending=deferred<{available:boolean;info:unknown}>();vi.mocked(s.port.check).mockReturnValueOnce(pending.promise);const run=s.controller.command("check");s.controller.dispose();pending.resolve({available:true,info:manifest()});await run;expect(s.port.cancel).toHaveBeenCalled();expect(s.port.dispose).toHaveBeenCalled();expect(s.controller.value.state).not.toBe("available");await expect(s.controller.command("install")).rejects.toThrow("closed");
 });
});
