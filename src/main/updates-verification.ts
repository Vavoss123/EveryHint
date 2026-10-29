import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {join,resolve} from "node:path";
import {createHash} from "node:crypto";
import {createReadStream} from "node:fs";
import {stat} from "node:fs/promises";
const execute=promisify(execFile);
// The program is fixed. File paths travel only through the child environment,
// never PowerShell source, shell interpolation or a PATH-resolved executable.
const signatureProgram=`$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$signature = Get-AuthenticodeSignature -LiteralPath $env:EVERYHINT_VERIFY_FILE -ErrorAction Stop
if ($signature.Status -ne 'Valid' -or $null -eq $signature.SignerCertificate) { exit 2 }
[pscustomobject]@{ Path=$signature.Path; Subject=$signature.SignerCertificate.Subject; Status='Valid' } | ConvertTo-Json -Compress`;
export async function verifyPublisher(file:string,publishers:readonly string[]):Promise<void>{
  if(process.platform!=="win32"||publishers.length===0)throw Error("Windows publisher verification is unavailable.");
  try{
    const powershell=join(process.env.SystemRoot??"C:\\Windows","System32","WindowsPowerShell","v1.0");
    const result=await execute(join(powershell,"powershell.exe"),["-NoProfile","-NonInteractive","-EncodedCommand",Buffer.from(signatureProgram,"utf16le").toString("base64")],{windowsHide:true,timeout:20000,maxBuffer:64000,encoding:"utf8",env:{...process.env,PSModulePath:join(powershell,"Modules"),EVERYHINT_VERIFY_FILE:resolve(file)}});
    if(result.stderr.trim())throw Error("Signature inspection failed.");
    const data=JSON.parse(result.stdout.replace(/^\uFEFF/,"")) as Record<string,unknown>;
    if(data.Status!=="Valid"||typeof data.Path!=="string"||resolve(data.Path).toLowerCase()!==resolve(file).toLowerCase()||typeof data.Subject!=="string"||!publishers.some(name=>name.trim().toLowerCase()===(data.Subject as string).trim().toLowerCase()))throw Error("Publisher did not match.");
  }catch{throw Error("The installer does not have a valid trusted Windows publisher signature.");}
}
export async function verifyInstaller(file:string,expected:{sha512:string;size?:number},publishers:readonly string[],publisherCheck=verifyPublisher):Promise<void>{
  const details=await stat(file);
  if(!details.isFile()||details.size!==expected.size||details.size>1_500_000_000)throw Error("Installer size changed.");
  const hash=createHash("sha512");for await(const chunk of createReadStream(file))hash.update(chunk);
  if(hash.digest("base64")!==expected.sha512)throw Error("Installer checksum changed.");
  await publisherCheck(file,publishers);
}
