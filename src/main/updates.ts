import type {UpdateAction,UpdateSnapshot} from "../shared/updates";
import {authenticatedRelease,verifiedRelease,type UpdatePolicy,type ReleaseManifest} from "./updates-policy";
export interface UpdatePort {
  check():Promise<{available:boolean;info:unknown}>;
  download(progress:(percent:number)=>void):Promise<void>;
  verifyDownloaded():Promise<void>;
  install():void;
  cancel():void;
  dispose():void;
}
export class UpdateController {
  private snapshot:UpdateSnapshot;
  private port:UpdatePort|undefined;
  private release:ReleaseManifest|undefined;
  private generation=0;
  private closed=false;
  private running=false;
  constructor(private readonly policy:UpdatePolicy|null,private readonly version:string,private readonly factory:(policy:UpdatePolicy)=>UpdatePort,private readonly changed:(value:UpdateSnapshot)=>void,private readonly prepareInstall:()=>Promise<boolean>){
    this.snapshot={state:policy?"idle":"unconfigured",message:policy?"Check for a new EveryHint version when you are ready.":"Updates are not configured. Signing, an authenticated release feed and a trusted release key are required. No update network request is made.",availableVersion:null,progress:null,checkedAt:null};
  }
  get value():UpdateSnapshot{return structuredClone(this.snapshot);}
  private publish(patch:Partial<UpdateSnapshot>):void{if(this.closed)return;Object.assign(this.snapshot,patch);this.changed(this.value);}
  async command(action:UpdateAction):Promise<void>{
    if(!["check","download","install","cancel"].includes(action))throw Error("Unknown update action.");
    if(this.closed)throw Error("Updates are closed.");
    if(!this.policy)throw Error(this.snapshot.message);
    if(action==="cancel"){
      if(this.snapshot.state==="installing")throw Error("Installation has already started.");
      this.generation++;this.port?.cancel();this.release=undefined;
      this.publish({state:this.running?"cancelling":"idle",availableVersion:null,progress:null,message:this.running?"Cancelling update work…":"Update operation cancelled. Check again when ready."});return;
    }
    if(this.running)throw Error("An update operation is already running.");
    if(action==="download"&&this.snapshot.state!=="available")throw Error("Check and authenticate a new release before downloading.");
    if(action==="install"&&this.snapshot.state!=="downloaded")throw Error("Download and verify an update before installing.");
    const generation=++this.generation,current=()=>!this.closed&&generation===this.generation;
    this.running=true;
    try{
      this.port??=this.factory(this.policy);
      if(action==="check"){
        this.release=undefined;this.publish({state:"checking",availableVersion:null,progress:null,message:"Checking for a new version…"});
        const result=await this.port.check();if(!current())return;
        authenticatedRelease(result.info,this.policy);
        if(!result.available){this.publish({state:"current",checkedAt:Date.now(),message:"You have the latest available version."});return;}
        this.release=verifiedRelease(result.info,this.policy,this.version);
        this.publish({state:"available",availableVersion:this.release.version,checkedAt:Date.now(),message:`EveryHint ${this.release.version} is available. Download when ready.`});
      }else if(action==="download"){
        verifiedRelease(this.release,this.policy,this.version);
        this.publish({state:"downloading",progress:0,message:"Downloading and verifying the signed installer…"});
        await this.port.download(percent=>{if(current()&&Number.isFinite(percent))this.publish({progress:Math.max(0,Math.min(100,percent))});});if(!current())return;
        await this.port.verifyDownloaded();if(!current())return;
        this.publish({state:"downloaded",progress:100,message:"Update verified. Save your work, then restart to install. Capture and remote requests will stop."});
      }else{
        this.publish({state:"installing",message:"Preparing to restart and install…"});
        await this.port.verifyDownloaded();if(!current())return;
        const accepted=await this.prepareInstall();if(!current())return;
        if(!accepted){this.publish({state:"downloaded",message:"Installation postponed. Your verified update is ready."});return;}
        await this.port.verifyDownloaded();if(!current())return;
        this.port.install();
      }
    }catch{
      if(current())this.publish({state:"error",progress:null,message:"The update could not be completed or verified. No unverified installer was accepted. Check your connection and trusted release configuration, then check again."});
    }finally{
      this.running=false;
      if(this.snapshot.state==="cancelling")this.publish({state:"idle",message:"Update operation cancelled. Check again when ready."});
    }
  }
  dispose():void{this.closed=true;this.generation++;this.port?.cancel();this.port?.dispose();}
}
