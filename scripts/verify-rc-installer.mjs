// Read-only NSIS payload comparison. Never runs the installer or changes registry.
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtemp,mkdir,readFile,writeFile,rm,readdir} from "node:fs/promises";
import {join,resolve,dirname,basename} from "node:path";
import {createHash} from "node:crypto";
const output=resolve("artifacts/rc");await mkdir(output,{recursive:true});
const root=await mkdtemp(join(output,"installer-payload-")),tool=resolve("node_modules/electron-winstaller/vendor/7z-x64.exe");
assert.equal(dirname(root),output);assert.ok(basename(root).startsWith("installer-payload-"));
const installer=resolve("release/EveryHint-0.5.0-x64-private-unsigned-setup.exe");
const files=["EveryHint.exe","resources/app.asar","resources/speech/everyhint-transcriber.exe"];
async function nativeFiles(directory,prefix=""){
 const result=[];for(const entry of await readdir(directory,{withFileTypes:true})){
  if(entry.isDirectory())result.push(...await nativeFiles(join(directory,entry.name),`${prefix}${entry.name}/`));
  else if(entry.name.endsWith(".node"))result.push(`${prefix}${entry.name}`);
 }return result;
}
files.push(...(await nativeFiles(resolve("release/win-unpacked/resources/app.asar.unpacked"))).map(p=>`resources/app.asar.unpacked/${p}`));
const hash=async path=>createHash("sha256").update(await readFile(path)).digest("hex");
const report={installerSha256:await hash(installer),installerExecuted:false,installationPerformed:false,registryAcceptance:"not tested",comparisons:[],cleanup:false};
try{
 const expected=JSON.parse(await readFile("docs/evidence/p11-release.json","utf8"));
 assert.equal(report.installerSha256,expected.package.installer.sha256,"The private baseline artifact must remain unchanged");
 execFileSync(tool,["x",installer,`-o${root}`,"-y"],{windowsHide:true,stdio:"ignore"});
 const payload=join(root,"$PLUGINSDIR/app-64.7z"),unpacked=join(root,"payload");
 execFileSync(tool,["x",payload,`-o${unpacked}`,"-y",...files],{windowsHide:true,stdio:"ignore"});
 for(const file of files){const payloadHash=await hash(join(unpacked,file)),testedHash=await hash(resolve("release/win-unpacked",file));assert.equal(payloadHash,testedHash,`Installer payload differs: ${file}`);report.comparisons.push({file,sha256:payloadHash,match:true});}
 report.status="passed";
}finally{
 await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:200});report.cleanup=true;
 await writeFile(join(output,"installer-payload.json"),JSON.stringify(report,null,2));
}
console.log(JSON.stringify(report));
