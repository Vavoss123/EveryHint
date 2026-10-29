// Real wall-clock scheduler exercise. Both provider ports are local stubs.
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { AssistantController } from "../src/main/ai/controller";
import { IntelligenceController } from "../src/main/intelligence/controller";
import { CaptureSessionController } from "../src/main/session";
import { DEFAULT_INTELLIGENCE } from "../src/shared/intelligence";
import type { AIProvider, ProviderId } from "../src/shared/ai";
import type { TranscriptEvent } from "../src/shared/transcription";
const seconds=Number(process.argv.find(v=>v.startsWith("--seconds="))?.split("=")[1]??1800);
let calls=0,network=0;
globalThis.fetch=async()=>{network++;throw Error("Network disabled in mock endurance");};
const provider=(id:ProviderId):AIProvider=>({id,inspect:async()=>({id,auth:"chatgpt",ready:true,message:"Local fixture",capabilities:{text:true,images:false,tools:false},models:["fixture"],selectedModel:"fixture"}),respond:async function*(_r,_s,guard){assert.ok(!guard||guard());calls++;yield {type:"complete",text:"Synthetic endurance answer"};},dispose:async()=>{}});
const capture={...new CaptureSessionController({listSources:async()=>[],capture:async()=>{throw Error("No physical screen");}},()=>3000,()=>{}).value,state:"ACTIVE" as const,sessionId:"fixture",epoch:1,consent:{screen:false,microphone:true,systemAudio:false,acknowledged:true}};
capture.sources.microphone.state="CAPTURING";
let events:TranscriptEvent[]=[];
const listener:{current?:IntelligenceController}={};
const assistant=new AssistantController([provider("codex"),provider("claude")],()=>({capture,events}),value=>listener.current?.assistantChanged(value));
assistant.captureChanged(capture);await assistant.inspect();
const intelligence=new IntelligenceController(assistant,()=>{},Date.now,()=>new Uint8Array(576),()=>({accountId:"fixture-account",transcribing:true}));listener.current=intelligence;
intelligence.configure({...DEFAULT_INTELLIGENCE,sessionMinutes:30,requestLimit:20,cooldownSeconds:30,sources:{microphone:true,systemAudio:false,screen:false}});
intelligence.mode("live");intelligence.update(capture,events);
await intelligence.authorise({acknowledged:true,expected:intelligence.value.liveContext,sharing:{microphone:true,systemAudio:false,screenshot:false,history:false},limits:{sessionMinutes:30,requestLimit:20,cooldownSeconds:30}});
const samples:unknown[]=[];const begin=performance.now();let index=0;let cpu=process.cpuUsage();let last=performance.now();
try{
 while(performance.now()-begin<seconds*1000){
  const now=Date.now();
  events=[{id:`fixture-${index}`,sessionId:"fixture",source:"microphone",startMs:now-1000,endMs:now,text:`Why would you choose algorithm ${index++} for this specific problem?`,state:"final",model:"tiny.en"}];
  intelligence.update(capture,events);
  await new Promise(r=>setTimeout(r,Math.min(35000,Math.max(1,seconds*1000-(performance.now()-begin)))));
  const current=process.cpuUsage(),at=performance.now();
  samples.push({elapsedSeconds:(at-begin)/1000,calls,live:intelligence.value.live,queue:intelligence.value.diagnostics.queueDepth,responses:assistant.value.responses.length,memory:process.memoryUsage(),cpuPercent:((current.user-cpu.user)+(current.system-cpu.system))/(at-last)/10});cpu=current;last=at;
  assert.ok(calls<=20);assert.ok(intelligence.value.diagnostics.queueDepth<=1);assert.equal(network,0);
  console.log(`mock Live: ${Math.round((at-begin)/1000)}s, ${calls} local requests`);
 }
 assert.ok(calls>0);if(seconds>=1800)assert.equal(intelligence.value.live,null);
 intelligence.revoke("Endurance complete");await assistant.cancel();
 mkdirSync("artifacts",{recursive:true});writeFileSync(`artifacts/p11-endurance-live${seconds<1800?"-pilot":""}.json`,JSON.stringify({status:"passed",provider:"local mock",physicalHardware:false,remoteRequests:network,calls,elapsedSeconds:(performance.now()-begin)/1000,samples},null,2));
}finally{intelligence.dispose();await assistant.dispose();}
