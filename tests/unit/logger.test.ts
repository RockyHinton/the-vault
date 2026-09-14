import { afterEach, describe, expect, it, vi } from "vitest";
import {
  currentLogLevel,
  isLogLevelEnabled,
  log,
  setLogLevel,
} from "../../server/observability/logger";

afterEach(() => setLogLevel("info"));

describe("logger", () => {
  it("drops events below the configured level and keeps the rest", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    setLogLevel("warn");
    expect(currentLogLevel()).toBe("warn");
    expect(isLogLevelEnabled("debug")).toBe(false);
    expect(isLogLevelEnabled("info")).toBe(false);
    expect(isLogLevelEnabled("warn")).toBe(true);
    log("info", "ignored");
    log("debug", "ignored");
    log("warn", "kept", { password: "hunter2", nested: { cookie: "x" } });
    expect(info).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    const line = JSON.parse(warn.mock.calls[0][0] as string) as Record<
      string,
      unknown
    >;
    expect(line).toMatchObject({
      level: "warn",
      event: "kept",
      password: "[REDACTED]",
      nested: { cookie: "[REDACTED]" },
    });
    info.mockRestore();
    warn.mockRestore();
  });

  it("emits debug events only when debug is enabled", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    log("debug", "hidden");
    setLogLevel("debug");
    log("debug", "shown");
    expect(info).toHaveBeenCalledTimes(1);
    info.mockRestore();
  });
});
