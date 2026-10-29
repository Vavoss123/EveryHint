import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {it,expect,vi} from "vitest";
import {verifyInstaller} from "../src/main/updates-verification";
it("rehashes cached installers before install and rejects same-size changed bytes before publisher inspection",async()=>{
 const root=await mkdtemp(join(tmpdir(),"everyhint-update-integrity-"));
 try{
  const path=join(root,"fixture.exe"),bytes=Buffer.from("synthetic installer bytes"),expected={size:bytes.length,sha512:createHash("sha512").update(bytes).digest("base64")},check=vi.fn(async()=>{});
  await writeFile(path,bytes);await verifyInstaller(path,expected,["Fixture Publisher"],check);expect(check).toHaveBeenCalledOnce();
  bytes[0]=bytes[0]!+1;await writeFile(path,bytes);await expect(verifyInstaller(path,expected,["Fixture Publisher"],check)).rejects.toThrow("checksum");expect(check).toHaveBeenCalledOnce();
 }finally{await rm(root,{recursive:true,force:true});}
});
it("does not turn Windows publisher inspection errors into successful verification",async()=>{
 const root=await mkdtemp(join(tmpdir(),"everyhint-update-signature-"));
 try{
  const path=join(root,"fixture.exe"),bytes=Buffer.from("controlled fixture"),expected={size:bytes.length,sha512:createHash("sha512").update(bytes).digest("base64")};await writeFile(path,bytes);
  await expect(verifyInstaller(path,expected,["Fixture Publisher"],async()=>{throw Error("verification unavailable");})).rejects.toThrow("unavailable");
 }finally{await rm(root,{recursive:true,force:true});}
});
