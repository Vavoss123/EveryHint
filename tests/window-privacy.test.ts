import {describe,it,expect,vi} from "vitest";
import {configureWindowPrivacy} from "../src/main/window-privacy";
import {parseSettings,DEFAULT_SETTINGS} from "../src/shared/validation";
import {developmentUrl} from "../src/main/security";
describe("P11 ordinary window-content privacy",()=>{
 it("preserves protection-off for existing settings without storing consent",()=>{const old={...DEFAULT_SETTINGS};delete old.protectWindow;const migrated=parseSettings(old);expect(migrated.protectWindow).toBe(false);expect(migrated).not.toHaveProperty("consent");});
 it("applies the requested setting and describes configuration, not receiving-device protection",()=>{const set=vi.fn();const result=configureWindowPrivacy({setContentProtection:set,isContentProtected:()=>true},true,"win32");expect(set).toHaveBeenCalledExactlyOnceWith(true);expect(result.state).toBe("configured");expect(result.message).toContain("not a guarantee");});
 it("reports failure when readback differs or native configuration throws",()=>{expect(configureWindowPrivacy({setContentProtection:()=>{},isContentProtected:()=>false},true,"win32").state).toBe("error");expect(configureWindowPrivacy({setContentProtection:()=>{throw Error("native failure");},isContentProtected:()=>true},true,"win32").configured).toBe(false);});
 it("reports disabling and unsupported platforms accurately",()=>{const set=vi.fn();expect(configureWindowPrivacy({setContentProtection:set,isContentProtected:()=>false},false,"win32").state).toBe("off");set.mockClear();expect(configureWindowPrivacy({setContentProtection:set,isContentProtected:()=>true},true,"linux").state).toBe("unsupported");expect(set).not.toHaveBeenCalled();});
 it("rejects non-boolean preferences and ignores development renderer URLs in a packaged app",()=>{expect(()=>parseSettings({...DEFAULT_SETTINGS,protectWindow:"true"})).toThrow();expect(developmentUrl("http://127.0.0.1:9999",true)).toBeUndefined();expect(developmentUrl("https://untrusted.test",true)).toBeUndefined();});
});
