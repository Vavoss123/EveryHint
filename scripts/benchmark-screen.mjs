import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { _electron } from "playwright-core";
import electron from "electron";

const profile = await mkdtemp(join(tmpdir(), "everyhint-screen-bench-"));
const entry = join(profile, "benchmark.cjs");
const env = { ...process.env };
for (const key of [
  "ELECTRON_RUN_AS_NODE",
  "OPENAI_API_KEY",
  "CODEX_API_KEY",
  "ANTHROPIC_API_KEY",
  "CLAUDE_CODE_OAUTH_TOKEN",
])
  delete env[key];
await writeFile(
  entry,
  `
const {app,BrowserWindow,nativeImage}=require('electron');
app.setPath('userData',__dirname);app.setName('EveryHint local screen benchmark');
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,width:360,height:380,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});await win.loadURL('about:blank');
 const width=1600,height=900,pixels=Buffer.alloc(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const at=(y*width+x)*4;pixels[at]=x%256;pixels[at+1]=y%256;pixels[at+2]=(x+y)%256;pixels[at+3]=255;}
 const encoded=nativeImage.createFromBitmap(pixels,{width,height}).toJPEG(75),url='data:image/jpeg;base64,'+encoded.toString('base64');
 const samples=[],cpuStart=process.cpuUsage(),start=performance.now();let bitmapBytes=0;
 for(let i=0;i<50;i++){
  const at=performance.now();const bytes=nativeImage.createFromDataURL(url).resize({width:32,height:18,quality:'good'}).toBitmap();bitmapBytes=bytes.length;
  const values=new Uint8Array(576);for(let j=0;j<576;j++)values[j]=Math.round((bytes[j*4]+bytes[j*4+1]+bytes[j*4+2])/3);
  samples.push(performance.now()-at);
 }
 const elapsed=performance.now()-start,cpu=process.cpuUsage(cpuStart);samples.sort((a,b)=>a-b);
 globalThis.__benchmark={fixture:'synthetic gradient; no desktop/audio capture',width,height,encodedBytes:encoded.length,samples:50,bitmapBytes,gridBytes:576,totalMs:elapsed,meanMs:elapsed/50,p95Ms:samples[Math.floor(samples.length*0.95)],mainRssBytes:process.memoryUsage().rss,cpuUserMs:cpu.user/1000,cpuSystemMs:cpu.system/1000,remoteRequests:0,hardwareAcceptance:false};
});
`,
);
let desktop;
try {
  desktop = await _electron.launch({
    executablePath: electron,
    args: [entry],
    env,
    timeout: 30000,
  });
  await desktop.firstWindow();
  let report;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    report = await desktop.evaluate(() => globalThis.__benchmark);
    if (report) break;
    await new Promise((done) => setTimeout(done, 50));
  }
  assert.ok(report);
  assert.equal(report.bitmapBytes, 2304);
  assert.equal(report.samples, 50);
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/p7-native-screen-benchmark.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  await desktop.close();
  desktop = undefined;
} finally {
  if (desktop) await desktop.close();
  if (
    resolve(profile).startsWith(resolve(tmpdir()) + sep) &&
    profile.includes("everyhint-screen-bench-")
  )
    await rm(profile, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  else {
    process.exitCode = 1;
    console.error("Unsafe benchmark cleanup path; cleanup skipped.");
  }
}
