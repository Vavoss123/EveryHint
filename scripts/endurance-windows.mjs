// Three real-time controlled Electron runs using owned synthetic media and the
// actual cached Whisper helper. Never requests physical media or remote AI.
import assert from "node:assert/strict";
import {mkdtemp,mkdir,link,copyFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve,dirname,basename} from "node:path";
import electron from "electron";
import {_electron} from "playwright-core";
import {loadSpeechFixture} from "./speech-fixture.mjs";
import {installSyntheticAudio} from "./synthetic-audio.mjs";
const duration=Number(process.argv.find(v=>v.startsWith("--seconds="))?.split("=")[1]??1800);
assert.ok(Number.isInteger(duration)&&duration>=10&&duration<=3600);
const speechRoot=process.env.EVERYHINT_SPEECH_HOME??join(process.env.LOCALAPPDATA,"EveryHint","speech"),fixture=await loadSpeechFixture(speechRoot),sleep=ms=>new Promise(r=>setTimeout(r,ms));
await mkdir("artifacts",{recursive:true});
async function run(scenario){
 const home=await mkdtemp(join(tmpdir(),"everyhint-p11-endurance-")),speech=join(home,"speech"),env={...process.env,EVERYHINT_TEST_USER_DATA:home,EVERYHINT_SPEECH_HOME:speech};
 for(const k of ["ELECTRON_RUN_AS_NODE","ELECTRON_RENDERER_URL","OPENAI_API_KEY","CODEX_API_KEY","ANTHROPIC_API_KEY","CLAUDE_CODE_OAUTH_TOKEN"])delete env[k];
 let desktop;const samples=[],errors=[],report={scenario,requestedSeconds:duration,physicalHardware:false,remoteRequests:0,crashes:0,cycles:0};
 const unwrap=r=>{assert.ok(r.ok,r.error);return r.value;};
 try{
  if(scenario!=="screen")for(const file of ["models/ggml-tiny.en.bin","runtime/everyhint-transcriber.exe"]){await mkdir(dirname(join(speech,file)),{recursive:true});await link(join(speechRoot,file),join(speech,file)).catch(()=>copyFile(join(speechRoot,file),join(speech,file)));}
  desktop=await _electron.launch({executablePath:electron,args:[resolve(".")],env,timeout:30000});
  await desktop.context().addInitScript(()=>{if(!location.pathname.endsWith("/audio.html"))return;const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args){this.loop=true;return start.apply(this,args);};});
  await desktop.context().addInitScript(installSyntheticAudio,{samples:Array.from(fixture.samples),sampleRate:fixture.sampleRate});
  const page=await desktop.firstWindow();page.on("pageerror",e=>errors.push(e.message));await page.waitForFunction(()=>window.everyhint&&document.querySelector(".capture-controls"));
  await desktop.evaluate(({desktopCapturer,nativeImage,BrowserWindow})=>{globalThis.__p11Network=0;globalThis.fetch=async()=>{globalThis.__p11Network++;throw Error("Real provider/network disabled in endurance");};const width=1280,height=720,pixels=Buffer.alloc(width*height*4,100);for(let i=3;i<pixels.length;i+=4)pixels[i]=255;const thumbnail=nativeImage.createFromBitmap(pixels,{width,height});desktopCapturer.getSources=async()=>[{id:"screen:99:0",name:"Synthetic endurance screen",thumbnail,display_id:"99",appIcon:null}];BrowserWindow.getAllWindows()[0].hide();});
  const screen=scenario!=="transcription",microphone=scenario!=="screen",systemAudio=scenario==="combined",consent={screen,microphone,systemAudio,acknowledged:true};
  await page.evaluate(async()=>{const r=await window.everyhint.getSnapshot();const settings={...r.value.settings,captureIntervalMs:1000,intelligence:{confidenceThreshold:.85,cooldownSeconds:30,requestLimit:20,sessionMinutes:30,retentionMinutes:5,sources:{microphone:true,systemAudio:true,screen:true},excludedSourceIds:[]}};const save=await window.everyhint.saveSettings(settings);if(!save.ok)throw Error(save.error);const mode=await window.everyhint.setOperatingMode("auto-hint");if(!mode.ok)throw Error(mode.error);});
  async function start(){if(screen)unwrap(await page.evaluate(c=>window.everyhint.listSources(c),consent));unwrap(await page.evaluate(c=>window.everyhint.prepare({...(c.screen?{sourceId:"screen:99:0"}:{}),consent:c}),consent));unwrap(await page.evaluate(()=>window.everyhint.session("start")));if(microphone){await page.waitForFunction(async()=>{const r=await window.everyhint.getSnapshot();return r.ok&&r.value.session.sources.microphone.state==="CAPTURING";});unwrap(await page.evaluate(()=>window.everyhint.transcription("enable")));await page.waitForFunction(async()=>{const r=await window.everyhint.getTranscription();return r.ok&&r.value.state==="LISTENING";});}}
  await start();const begin=performance.now();report.startedAt=new Date().toISOString();
  for(let i=0;performance.now()-begin<duration*1000;i++){
   await sleep(Math.min(10000,duration*1000-(performance.now()-begin)));const at=performance.now();
   const data=await page.evaluate(async()=>{const a=await window.everyhint.getSnapshot(),s=await window.everyhint.getTranscription(),l=await window.everyhint.getIntelligence(),ai=await window.everyhint.getAssistant();if(!a.ok||!s.ok||!l.ok||!ai.ok)throw Error("State read failed");return{state:a.value.session.state,frames:a.value.session.frameCount,speechState:s.value.state,events:s.value.events.length,diagnostics:s.value.diagnostics,questions:l.value.questions.length,suggestions:l.value.suggestions.length,intelligenceEvents:l.value.events.length,live:l.value.live,assistantResponses:ai.value.responses.length,error:a.value.session.error??s.value.error};});
   const metrics=await desktop.evaluate(({app})=>({main:process.memoryUsage(),processes:app.getAppMetrics().map(p=>({type:p.type,cpu:p.cpu.percentCPUUsage,workingSetKiB:p.memory.workingSetSize})),network:globalThis.__p11Network}));
   samples.push({elapsedSeconds:(performance.now()-begin)/1000,ipcMs:performance.now()-at,...data,...metrics});assert.equal(data.state,"ACTIVE");assert.equal(metrics.network,0);assert.equal(data.live,null);assert.equal(data.assistantResponses,0);assert.equal(data.error,null);assert.ok(data.suggestions<=3);assert.ok(data.diagnostics.queueLength<=6);if(microphone)assert.equal(data.speechState,"LISTENING");if(i%6===0)console.log(`${scenario}: ${Math.round((performance.now()-begin)/1000)}s, ${data.frames} frames, ${data.events} retained final segments, queue ${data.diagnostics.queueLength}`);
  }
  report.elapsedSeconds=(performance.now()-begin)/1000;report.lastBeforeStop=samples.at(-1);
  unwrap(await page.evaluate(()=>window.everyhint.session("stop")));
  for(let i=0;i<3;i++){await start();unwrap(await page.evaluate(()=>window.everyhint.session("pause")));unwrap(await page.evaluate(()=>window.everyhint.session("resume")));unwrap(await page.evaluate(()=>window.everyhint.session("stop")));report.cycles++;}
  await sleep(1000);report.cleanup=await page.evaluate(async()=>({state:(await window.everyhint.getSnapshot()).value.session.state,speech:(await window.everyhint.getTranscription()).value.state,queue:(await window.everyhint.getTranscription()).value.diagnostics.queueLength,live:(await window.everyhint.getIntelligence()).value.live}));assert.equal(report.cleanup.state,"STOPPED");assert.equal(report.cleanup.queue,0);assert.equal(report.cleanup.live,null);report.audioWindows=await desktop.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().filter(w=>w.webContents.getURL().endsWith("/audio.html")).length);assert.equal(report.audioWindows,0);assert.equal(errors.length,0);
  report.summary={samples:samples.length,mainRssFirst:samples[0].main.rss,mainRssLast:samples.at(-1).main.rss,mainRssMax:Math.max(...samples.map(s=>s.main.rss)),mainHeapMax:Math.max(...samples.map(s=>s.main.heapUsed)),electronCpuMean:samples.reduce((n,s)=>n+s.processes.reduce((n,p)=>n+p.cpu,0),0)/samples.length,ipcMaxMs:Math.max(...samples.map(s=>s.ipcMs)),queueMax:Math.max(...samples.map(s=>s.diagnostics.queueLength)),workerMemoryMax:Math.max(...samples.map(s=>s.diagnostics.workerMemoryBytes??0))};report.status="passed";
 }catch(error){report.status="failed";report.error=error.message;throw error;}
 finally{report.errors=errors;await writeFile(`artifacts/p11-endurance-${scenario}${duration<1800?"-pilot":""}.json`,JSON.stringify({...report,samples},null,2));if(desktop)await desktop.close();if(dirname(home)===resolve(tmpdir())&&basename(home).startsWith("everyhint-p11-endurance-"))await rm(home,{recursive:true,force:true,maxRetries:5,retryDelay:100});console.log(JSON.stringify({...report,lastBeforeStop:undefined}));}
}
const results=await Promise.allSettled(["screen","transcription","combined"].map(run));if(results.some(r=>r.status==="rejected")){for(const r of results)if(r.status==="rejected")console.error(r.reason);process.exitCode=1;}
