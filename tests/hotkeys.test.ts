import { describe, expect, it, vi } from "vitest";
import { DEFAULT_HOTKEYS, HotkeyController } from "../src/main/hotkeys";

describe("global hotkeys", () => {
  it("wires show/hide, pause/resume, and emergency stop independently of focus", () => {
    const callbacks = new Map<string, () => void>();
    const registry = {
      register: vi.fn((key: string, action: () => void) => {
        callbacks.set(key, action);
        return true;
      }),
      unregister: vi.fn(),
    };
    const handlers = { toggle: vi.fn(), pause: vi.fn(), stop: vi.fn() };
    const controller = new HotkeyController(registry);
    expect(controller.register(handlers).every((key) => key.registered)).toBe(
      true,
    );
    for (const action of ["toggle", "pause", "stop"] as const) {
      callbacks.get(DEFAULT_HOTKEYS[action])!();
      expect(handlers[action]).toHaveBeenCalledTimes(1);
    }
    controller.dispose();
    controller.dispose();
    expect(registry.unregister).toHaveBeenCalledTimes(3);
  });
  it("reports conflicts and thrown registration errors, preserving successful shortcuts", () => {
    const registry = {
      register: vi
        .fn()
        .mockReturnValueOnce(false)
        .mockImplementationOnce(() => {
          throw new Error("OS error");
        })
        .mockReturnValueOnce(true),
      unregister: vi.fn(),
    };
    const controller = new HotkeyController(registry);
    const statuses = controller.register({
      toggle: vi.fn(),
      pause: vi.fn(),
      stop: vi.fn(),
    });
    expect(statuses.map((status) => status.registered)).toEqual([
      false,
      false,
      true,
    ]);
    controller.dispose();
    expect(registry.unregister).toHaveBeenCalledExactlyOnceWith(
      DEFAULT_HOTKEYS.stop,
    );
  });
  it("accepts future bindings and unregisters old bindings before replacing them", () => {
    const registry = { register: vi.fn(() => true), unregister: vi.fn() };
    const controller = new HotkeyController(registry);
    const handlers = { toggle: vi.fn(), pause: vi.fn(), stop: vi.fn() };
    controller.register(handlers);
    controller.register(handlers, {
      ...DEFAULT_HOTKEYS,
      toggle: "Control+Shift+Space",
    });
    expect(registry.unregister).toHaveBeenCalledTimes(3);
    expect(registry.register).toHaveBeenCalledWith(
      "Control+Shift+Space",
      handlers.toggle,
    );
    controller.dispose();
  });
});
