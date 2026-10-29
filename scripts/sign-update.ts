// Operator-only metadata creation. No key generation, upload or publishing.
import {readFile,writeFile,stat} from "node:fs/promises";
import {createReadStream} from "node:fs";
import {basename} from "node:path";
import {createHash,createPrivateKey,createPublicKey,sign} from "node:crypto";
import {updatePolicy,releasePayload} from "../src/main/updates-policy";
import {verifyPublisher} from "../src/main/updates-verification";
try{
 const [installer,version,keyFile,output]=process.argv.slice(2);
 if(!installer||!version||!keyFile||!output)throw Error("Arguments required.");
 const policy=updatePolicy(JSON.parse(await readFile("resources/windows-updates.json","utf8")));
 if(!policy)throw Error("Trusted release policy is not configured.");
 await verifyPublisher(installer,policy.publisherNames);
 const key=createPrivateKey(await readFile(keyFile));
 if(!createPublicKey(key).export({format:"der",type:"spki"}).equals(createPublicKey(policy.manifestPublicKey).export({format:"der",type:"spki"})))throw Error("Release key does not match.");
 const hash=createHash("sha512");for await(const chunk of createReadStream(installer))hash.update(chunk);
 const value={version,files:[{url:basename(installer),sha512:hash.digest("base64"),size:(await stat(installer)).size}],everyhintSignature:""};
 value.everyhintSignature=sign(null,Buffer.from(releasePayload(value)),key).toString("base64");
 await writeFile(output,JSON.stringify(value,null,2)+"\n",{flag:"wx"});
 console.log("Authenticated update metadata written. Nothing was uploaded or published.");
}catch{console.error("Update metadata signing failed. Check the bundled policy, Windows publisher, matching private key, arguments and unused output path.");process.exitCode=1;}
