// Private release inputs only. No download, signing discovery or publishing.
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import {join} from "node:path";
import {deflateSync} from "node:zlib";
import {crc32} from "node:zlib";
import {rm} from "node:fs/promises";
import {updatePolicy} from "../src/main/updates-policy.ts";
const runtime="artifacts/release-speech/runtime";
const helper=await readFile(join(runtime,"everyhint-transcriber.exe"));
if(helper.length<256||helper.toString("ascii",0,2)!=="MZ"||helper.readUInt16LE(helper.readUInt32LE(0x3c)+4)!==0x8664)throw Error("Prepare a Windows x64 PE helper for this installer target.");
for(const needle of [Buffer.from("C:\\Users\\"),Buffer.from("C:/Users/"),Buffer.from("C:\\Users\\","utf16le")])if(helper.includes(needle))throw Error("Native helper contains a developer path; rebuild with source labels.");
await mkdir("out/main",{recursive:true});
await writeFile("out/main/speech-runtime.json",JSON.stringify({schema:1,arch:"x64",revision:"d1be6fde11ac6e0407606b4e42fe72d34add8037",bytes:helper.length,sha256:createHash("sha256").update(helper).digest("hex")},null,2));
const updates=JSON.parse(await readFile("resources/windows-updates.json","utf8"));
if(updates.enabled===true){
  const policy=updatePolicy(updates);if(!policy)throw Error("Release update policy is incomplete or invalid.");
  // The controller validates the bundled policy before creating an updater.
  // Runtime config stays inside ASAR so native signature policy cannot come from a remote manifest.
  await writeFile("out/main/update-config.yml",JSON.stringify({provider:"generic",url:policy.feedUrl,publisherName:policy.publisherNames,updaterCacheDirName:"everyhint-updater"}));
}else await rm("out/main/update-config.yml",{force:true});
// The same block E and warm/red brand colours as the application tray icon.
await mkdir("build",{recursive:true});
const size=256,raw=Buffer.alloc((size*4+1)*size);
for(let y=0;y<size;y++)for(let x=0;x<size;x++){
 const e=x>=68&&x<100&&y>=52&&y<204||x>=68&&x<190&&(y>=52&&y<82||y>=113&&y<143||y>=174&&y<204);
 const colour=e?[255,255,255]:[224,26,52],p=y*(size*4+1)+1+x*4;for(let c=0;c<3;c++)raw[p+c]=colour[c];raw[p+3]=255;
}
const chunk=(name,data)=>{const type=Buffer.from(name),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([type,data])));return Buffer.concat([length,type,data,crc]);};
const header=Buffer.alloc(13);header.writeUInt32BE(size);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",header),chunk("IDAT",deflateSync(raw)),chunk("IEND",Buffer.alloc(0))]);
const ico=Buffer.alloc(22);ico.writeUInt16LE(1,2);ico.writeUInt16LE(1,4);ico.writeUInt16LE(1,10);ico.writeUInt16LE(32,12);ico.writeUInt32LE(png.length,14);ico.writeUInt32LE(22,18);await writeFile("build/icon.ico",Buffer.concat([ico,png]));
console.log(`Prepared x64 helper (${helper.length} bytes), manifest and branded icon; models excluded.`);
