import {build} from "rolldown";
import {spawn} from "node:child_process";
import {builtinModules} from "node:module";
await build({input:"scripts/endurance-live.ts",external:[...builtinModules,...builtinModules.map(n=>`node:${n}`)],platform:"node",output:{file:"artifacts/p11-live-runner.mjs",format:"esm"}});
const child=spawn(process.execPath,["artifacts/p11-live-runner.mjs",...process.argv.slice(2)],{stdio:"inherit",windowsHide:true});child.on("exit",code=>{process.exitCode=code??1;});
