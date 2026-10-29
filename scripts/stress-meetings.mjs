import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtemp,rm,writeFile,readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve,dirname,basename} from "node:path";
import {randomBytes,createHash} from "node:crypto";
import {Worker} from "node:worker_threads";
import electron from "electron";
if(!process.versions.electron){execFileSync(electron,["scripts/stress-meetings.mjs"],{env:{...process.env,ELECTRON_RUN_AS_NODE:"1"},windowsHide:true,stdio:"inherit"});}
else{
 const root=await mkdtemp(join(tmpdir(),"everyhint-p11-storage-")),key=randomBytes(32),path=join(root,"history.sqlite"),profile=createHash("sha256").update(root).digest("hex");
 let worker,sequence=0;const pending=new Map(),samples=[];let restarts=0;
 function open(){worker=new Worker(resolve("out/main/meetings-worker.js"),{workerData:{path,profile,key:new Uint8Array(key)}});worker.on("message",m=>{const job=pending.get(m.id);if(!job)return;pending.delete(m.id);clearTimeout(job.timer);if(m.error)job.reject(Error(m.error));else job.resolve(m.value);});worker.on("error",e=>{for(const job of pending.values()){clearTimeout(job.timer);job.reject(e);}pending.clear();});}
 const call=(method,...args)=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>reject(Error("Storage stress timeout")),10000);pending.set(id,{resolve,reject,timer});worker.postMessage({id,method,args});});
 try{
  open();await call("ready");
  for(let i=0;i<25;i++){
   const at=performance.now(),doc=await call("create",`P11 private fixture ${i}`,30),sessionId=`cycle-${i}`,now=Date.now();
   await call("begin",doc.id,{sessionId,startedAt:now-2000,endedAt:null,sources:[{kind:"microphone",id:"fixture",name:"Synthetic fixture"}]},30);
   await call("append",doc.id,sessionId,[{id:`segment-${i}`,sessionId,source:"microphone",state:"final",startMs:now-1000,endMs:now,text:"P11 secret marker. Checklist due Wednesday.",model:"tiny.en"}],30);
   await call("finish",doc.id,sessionId,false,30);
   if(i%5===4){await worker.terminate();open();await call("ready");restarts++;}
   assert.equal((await call("get",doc.id)).segmentCount,1);assert.equal((await call("transcript",doc.id,0,100)).segments.length,1);
   await call("delete",doc.id);await assert.rejects(call("get",doc.id));
   samples.push({cycle:i+1,ms:performance.now()-at,memory:process.memoryUsage()});
  }
  assert.ok(!(await readFile(path)).includes(Buffer.from("P11 secret marker")));
  const report={status:"passed",cycles:25,workerRestarts:restarts,remoteRequests:0,meanCycleMs:samples.reduce((n,s)=>n+s.ms,0)/samples.length,maxCycleMs:Math.max(...samples.map(s=>s.ms)),samples};await writeFile("artifacts/p11-storage-stress.json",JSON.stringify(report,null,2));console.log(JSON.stringify({...report,samples:undefined}));
 }finally{if(worker)await worker.terminate();key.fill(0);if(dirname(root)===resolve(tmpdir())&&basename(root).startsWith("everyhint-p11-storage-"))await rm(root,{recursive:true,force:true});}
}
