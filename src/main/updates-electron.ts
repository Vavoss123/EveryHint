import electronUpdater from "electron-updater";
import type {CancellationToken} from "builder-util-runtime";
import type {UpdatePolicy} from "./updates-policy";
import type {UpdatePort} from "./updates";
import {verifyPublisher,verifyInstaller} from "./updates-verification";
export function windowsUpdater(policy:UpdatePolicy,configPath:string):UpdatePort {
  const {NsisUpdater}=electronUpdater;
  const updater=new NsisUpdater({provider:"generic",url:policy.feedUrl,channel:"latest",useMultipleRangeRequest:false});
  updater.autoDownload=false;updater.autoInstallOnAppQuit=false;
  updater.allowDowngrade=false;updater.allowPrerelease=false;updater.disableWebInstaller=true;
  updater.disableDifferentialDownload=true;
  updater.logger=null;updater.updateConfigPath=configPath;
  updater.verifyUpdateCodeSignature=async(_names,file)=>{await verifyPublisher(file,policy.publisherNames);return null;};
  updater.on("error",()=>{});
  let token:CancellationToken|undefined,downloaded:string|undefined,expected:{sha512:string;size?:number}|undefined;
  return{
    async check(){const result=await updater.checkForUpdates();if(!result)throw Error("Update check unavailable.");token=result.cancellationToken;expected=result.updateInfo.files[0];downloaded=undefined;return{available:result.isUpdateAvailable,info:result.updateInfo};},
    async download(progress){const listener=(value:{percent:number})=>progress(value.percent);updater.on("download-progress",listener);try{const files=await updater.downloadUpdate(token);if(files.length!==1)throw Error("Full installer required.");downloaded=files[0];}finally{updater.removeListener("download-progress",listener);}},
    async verifyDownloaded(){
      if(!downloaded||!expected)throw Error("No verified installer is available.");
      await verifyInstaller(downloaded,expected,policy.publisherNames);
    },
    install(){updater.quitAndInstall(false,true);},
    cancel(){token?.cancel();},
    dispose(){updater.removeAllListeners();},
  };
}
