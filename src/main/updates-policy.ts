import {createPublicKey,verify} from "node:crypto";
export interface UpdatePolicy {feedUrl:string;publisherNames:string[];manifestPublicKey:string}
export interface ReleaseManifest {
  version:string;
  files:{url:string;sha512:string;size:number}[];
  minimumSystemVersion?:string;
  everyhintSignature:string;
}
export function updatePolicy(value:unknown):UpdatePolicy|null {
  if(!value||typeof value!=="object")return null;
  const p=value as Record<string,unknown>;
  if(p.enabled!==true)return null;
  try{
    const url=new URL(String(p.feedUrl));
    if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||url.port&&url.port!=="443")return null;
    if(!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname)||/(^|\.)(localhost|local|test|invalid|example)$/.test(url.hostname))return null;
    if(!Array.isArray(p.publisherNames)||p.publisherNames.length<1||p.publisherNames.length>4||p.publisherNames.some(n=>typeof n!=="string"||!n.trim()||n.length>200||/[\r\n]/.test(n)))return null;
    if(typeof p.manifestPublicKey!=="string"||p.manifestPublicKey.length>4096||!/^-----BEGIN PUBLIC KEY-----\r?\n[A-Za-z0-9+/=\r\n]+-----END PUBLIC KEY-----\s*$/.test(p.manifestPublicKey)||createPublicKey(p.manifestPublicKey).asymmetricKeyType!=="ed25519")return null;
    return{feedUrl:url.href,publisherNames:[...p.publisherNames] as string[],manifestPublicKey:p.manifestPublicKey};
  }catch{return null;}
}
export function releasePayload(value:unknown):string {
  if(!value||typeof value!=="object"||JSON.stringify(value).length>20000)throw Error("Invalid release metadata.");
  const p=value as Record<string,unknown>;
  if(typeof p.version!=="string"||!/^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(p.version)||!Array.isArray(p.files)||p.files.length!==1||p.packages!==undefined)throw Error("A stable full Windows installer is required.");
  const files=p.files.map(raw=>{
    const file=raw as Record<string,unknown>;
    if(!file||file.isAdminRightsRequired!==undefined&&file.isAdminRightsRequired!==false||typeof file.url!=="string"||!/^EveryHint-[A-Za-z0-9._-]+\.exe$/.test(file.url)||typeof file.sha512!=="string"||!/^[A-Za-z0-9+/]{86}==$/.test(file.sha512)||!Number.isSafeInteger(file.size)||Number(file.size)<1||Number(file.size)>1_500_000_000)throw Error("Invalid installer metadata.");
    return{url:file.url,sha512:file.sha512,size:file.size};
  });
  if(p.minimumSystemVersion!==undefined&&(typeof p.minimumSystemVersion!=="string"||!/^\d+(\.\d+){0,3}$/.test(p.minimumSystemVersion)))throw Error("Invalid minimum Windows version.");
  return JSON.stringify({schema:1,version:p.version,files,minimumSystemVersion:p.minimumSystemVersion??null});
}
export function authenticatedRelease(value:unknown,policy:UpdatePolicy):ReleaseManifest {
  const payload=releasePayload(value),p=value as ReleaseManifest;
  if(typeof p.everyhintSignature!=="string"||!/^[A-Za-z0-9+/]{86}==$/.test(p.everyhintSignature)||!verify(null,Buffer.from(payload),policy.manifestPublicKey,Buffer.from(p.everyhintSignature,"base64")))throw Error("Release metadata is unsigned or failed authentication.");
  return structuredClone(p);
}
export function verifiedRelease(value:unknown,policy:UpdatePolicy,currentVersion:string):ReleaseManifest {
  const p=authenticatedRelease(value,policy);
  const next=p.version.split(".").map(Number),current=currentVersion.split(".").map(Number);
  const difference=next.map((v,i)=>v-(current[i]??0)).find(v=>v!==0)??0;
  if(difference<=0)throw Error("This is not a newer stable version.");
  return p;
}
