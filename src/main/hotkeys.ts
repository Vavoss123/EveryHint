import type {
  HotkeyAction,
  HotkeyBindings,
  HotkeyStatus,
} from "../shared/contracts";

import { DEFAULT_HOTKEYS } from "../shared/shortcuts";
export { DEFAULT_HOTKEYS } from "../shared/shortcuts";
interface ShortcutRegistry {
  register(accelerator: string, callback: () => void): boolean;
  unregister(accelerator: string): void;
}
export class HotkeyController {
  private registered: string[] = [];
  constructor(private readonly registry: ShortcutRegistry) {}
  register(
    handlers: Record<HotkeyAction, () => void>,
    bindings: HotkeyBindings = DEFAULT_HOTKEYS,
  ): HotkeyStatus[] {
    this.dispose();
    return (Object.keys(bindings) as HotkeyAction[]).map((action) => {
      const accelerator = bindings[action];
      let registered: boolean;
      try {
        registered = this.registry.register(accelerator, handlers[action]);
      } catch {
        registered = false;
      }
      if (registered) this.registered.push(accelerator);
      return { action, accelerator, registered };
    });
  }
  dispose(): void {
    for (const accelerator of this.registered)
      this.registry.unregister(accelerator);
    this.registered = [];
  }
}
