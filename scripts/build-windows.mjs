import {execFileSync} from "node:child_process";
import {readFile} from "node:fs/promises";
const {version}=JSON.parse(await readFile("package.json","utf8"));
if((await readFile("resources/windows-updates.json","utf8")).includes("PRIVATE KEY"))throw Error("Release policy must contain only a public key. Remove private key material before building.");
if(process.platform!=="win32"||process.arch!=="x64")throw Error("This release target is verified only on Windows x64.");
execFileSync(process.execPath,["node_modules/electron-vite/bin/electron-vite.js","build"],{stdio:"inherit",windowsHide:true});
execFileSync(process.execPath,["scripts/prepare-windows.mjs"],{stdio:"inherit",windowsHide:true});
execFileSync(process.execPath,["node_modules/electron-builder/cli.js","--win","--x64","--publish","never",...process.argv.slice(2)],{stdio:"inherit",windowsHide:true,env:{...process.env,CSC_IDENTITY_AUTO_DISCOVERY:"false",CSC_LINK:"",WIN_CSC_LINK:""}});
console.log(`EveryHint ${version}: private unsigned test build only. No release was published.`);
