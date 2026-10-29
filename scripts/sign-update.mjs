import {build} from "rolldown";
import {execFileSync} from "node:child_process";
import {builtinModules} from "node:module";
await build({input:"scripts/sign-update.ts",external:[...builtinModules,...builtinModules.map(n=>`node:${n}`)],platform:"node",output:{file:"artifacts/p11-sign-update.mjs",format:"esm"}});
try{execFileSync(process.execPath,["artifacts/p11-sign-update.mjs",...process.argv.slice(2)],{stdio:"inherit",windowsHide:true});}catch{process.exitCode=1;}
