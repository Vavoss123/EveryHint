import assert from "node:assert/strict";
import {mkdtemp,mkdir,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve,dirname,basename} from "node:path";
import electron from "electron";
import {_electron} from "playwright-core";
const root=await mkdtemp(join(tmpdir(),"everyhint-p11-desktop-")),env={...process.env,EVERYHINT_TEST_USER_DATA:root,EVERYHINT_SPEECH_HOME:join(root,"speech")};
for(const k of ["ELECTRON_RUN_AS_NODE","ELECTRON_RENDERER_URL","OPENAI_API_KEY","CODEX_API_KEY","ANTHROPIC_API_KEY"])delete env[k];
let desktop,checks=0;const check=(v,m)=>{assert.ok(v,m);checks++;};const errors=[];
async function launch(){desktop=await _electron.launch({executablePath:electron,args:[resolve(".")],env});const page=await desktop.firstWindow();page.on("pageerror",e=>errors.push(e.message));await page.waitForFunction(()=>window.everyhint&&document.querySelector(".capture-controls"));return page;}
try{
 let page=await launch();let state=(await page.evaluate(()=>window.everyhint.getSnapshot())).value;
 check(state.privacy.state==="off","Legacy default protection off");
 const status=await page.evaluate(()=>window.everyhint.desktopStatus());check(status.ok&&status.value.version==="0.5.0"&&status.value.updates.state==="unconfigured","Version and disabled update foundation");
 const unconfigured=await page.evaluate(()=>window.everyhint.update("check"));check(!unconfigured.ok&&unconfigured.error.includes("not configured"),"Update IPC refuses network work without trusted release configuration");
 check((await page.evaluate(s=>window.everyhint.saveSettings({...s,protectWindow:true}),state.settings)).ok,"Protection preference saved");
 state=(await page.evaluate(()=>window.everyhint.getSnapshot())).value;
 check(state.privacy.requested&&state.privacy.configured&&state.privacy.state==="configured","Windows configuration readback");
 check(await desktop.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isContentProtected()),"Native Electron window reports protection");
 check((await page.getByText("Window protection: configured",{exact:true}).count())===1,"Persistent privacy indicator");
 await page.evaluate(async()=>{const s=(await window.everyhint.getSnapshot()).value.settings;await window.everyhint.saveSettings({...s,compact:false,layout:"dashboard"});});
 await page.getByRole("button",{name:"Settings",exact:true}).click();
 await page.getByRole("heading",{name:"Screen-sharing privacy",exact:true}).waitFor();
 check(await page.getByRole("button",{name:"Check for updates",exact:true}).isDisabled(),"Unconfigured update control explains its disabled state");
 check(await page.getByRole("checkbox",{name:"Protect EveryHint window content during screen sharing (Windows)"}).isChecked(),"Accessible checkbox reflects setting");
 await mkdir("artifacts",{recursive:true});await page.locator(".desktop-privacy").screenshot({path:"artifacts/p11-settings.png"});
 check((await page.evaluate(()=>({node:typeof window.require,process:typeof window.process}))).node==="undefined","Renderer has no Node require");
 await desktop.close();desktop=undefined;
 for(let i=0;i<3;i++){
  page=await launch();state=(await page.evaluate(()=>window.everyhint.getSnapshot())).value;
  check(state.session.state==="IDLE"&&state.session.consent===null,"Restart never restores capture consent");
  check((await page.evaluate(()=>window.everyhint.getIntelligence())).value.live===null,"Restart never restores remote Live grant");
  check(state.privacy.configured,"Privacy preference restored independently");
  await desktop.close();desktop=undefined;
 }
 check(errors.length===0,"No renderer errors");await writeFile("artifacts/p11-desktop-smoke.json",JSON.stringify({checks,errors,receivingDevice:"pending",physicalAudio:"pending",privacy:"Windows configuration readback only",restarts:3},null,2));console.log(`${checks} Windows desktop assertions passed`);
}finally{if(desktop)await desktop.close();if(dirname(root)===resolve(tmpdir())&&basename(root).startsWith("everyhint-p11-desktop-"))await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
