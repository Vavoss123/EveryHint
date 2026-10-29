// Launch the final fused binary normally; Chromium CDP observes only its renderer.
// No Node inspector, shell startup, provider auth or physical media.
import assert from "node:assert/strict";
import {spawn,execFileSync} from "node:child_process";
import {mkdtemp,rm,writeFile} from "node:fs/promises";
import {createServer} from "node:net";
import {tmpdir} from "node:os";
import {join,resolve,dirname,basename} from "node:path";
import {chromium} from "playwright-core";
const root=await mkdtemp(join(tmpdir(),"everyhint-p11-packaged-")),env={...process.env,EVERYHINT_TEST_USER_DATA:root,EVERYHINT_SPEECH_HOME:join(root,"speech"),ELECTRON_RENDERER_URL:"http://127.0.0.1:1/untrusted"};
for(const k of ["ELECTRON_RUN_AS_NODE","OPENAI_API_KEY","CODEX_API_KEY","ANTHROPIC_API_KEY","NODE_OPTIONS"])delete env[k];
const server=createServer();await new Promise(r=>server.listen(0,"127.0.0.1",r));const port=server.address().port;await new Promise(r=>server.close(r));
let child,browser;let checks=0;const errors=[],check=(v,m)=>{assert.ok(v,m);checks++;};
try{
 child=spawn(resolve("release/win-unpacked/EveryHint.exe"),[`--remote-debugging-port=${port}`,"--remote-debugging-address=127.0.0.1"],{env,windowsHide:true,stdio:"ignore"});
 const deadline=Date.now()+30000;while(!browser&&Date.now()<deadline){try{browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);}catch{await new Promise(r=>setTimeout(r,200));}}assert.ok(browser,"Packaged CDP start");
 const context=browser.contexts()[0];let page=context.pages()[0];if(!page)page=await context.waitForEvent("page");page.on("pageerror",e=>errors.push(e.message));await page.waitForFunction(()=>window.everyhint&&document.querySelector(".capture-controls"));
 check(page.url().startsWith("everyhint://app/"),"Packaged renderer ignores malicious development URL");
 const status=await page.evaluate(()=>window.everyhint.desktopStatus());check(status.ok&&status.value.packaged&&status.value.version==="0.5.0"&&status.value.updates.state==="unconfigured","Packaged identity and disabled updates");
 check(!(await page.evaluate(()=>window.everyhint.update("check"))).ok,"Packaged update check refuses unconfigured feed");
 check(!(await page.evaluate(()=>window.everyhint.update("install"))).ok,"Packaged update install refuses unconfigured trust");
 const state=(await page.evaluate(()=>window.everyhint.getSnapshot())).value;check(state.session.state==="IDLE"&&state.session.consent===null,"Capture initially disabled");
 check((await page.evaluate(()=>window.everyhint.getIntelligence())).value.live===null,"Live initially unauthorised");
 check((await page.evaluate(s=>window.everyhint.saveSettings({...s,protectWindow:true}),state.settings)).ok,"Packaged settings writable");
 check((await page.evaluate(()=>window.everyhint.getSnapshot())).value.privacy.configured,"Packaged protection readback");
 check((await page.evaluate(()=>window.everyhint.getTranscription())).value.runtimeInstalled,"Packaged helper hash verified");
 const contextState=await page.evaluate(()=>({node:typeof window.require,process:typeof window.process}));check(contextState.node==="undefined"&&contextState.process==="undefined","Packaged sandbox bridge");
 const accounts=await page.evaluate(()=>window.everyhint.getAccountConnection());check(accounts.ok,"Packaged account bridge/native credential module loads");
 check(errors.length===0,"No renderer errors");
 await writeFile("artifacts/p11-packaged-smoke.json",JSON.stringify({checks,errors,url:page.url(),status:status.value,hardware:"pending",cleanWindowsInstaller:"pending",oauthRealBrowser:"pending"},null,2));console.log(`${checks} final packaged-binary assertions passed`);
}finally{
 if(browser)await browser.close();
 // The fixture has not started capture. Terminate only this known test process tree.
 if(child&&child.exitCode===null)execFileSync("taskkill",["/PID",String(child.pid),"/T","/F"],{windowsHide:true,stdio:"ignore"});
 if(dirname(root)===resolve(tmpdir())&&basename(root).startsWith("everyhint-p11-packaged-"))await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:200});
}
