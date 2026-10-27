import { ProviderDriverKind } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { openCodeUsesExternalServer, updateNvidiaKey, verifyNvidiaKeyUpdate } from "./nvidiaSetup";

const opencode = ProviderDriverKind.make("opencode");

describe("NVIDIA key setup", () => {
  it("saves a sensitive, trimmed key while preserving other provider settings and secrets", () => {
    const instance = {
      driver: opencode,
      enabled: false,
      config: { binaryPath: "/usr/bin/opencode" },
      environment: [{ name: "OPENAI_API_KEY", value: "", sensitive: true, valueRedacted: true }],
    };
    expect(updateNvidiaKey(instance, "  nvapi-test  ", true)).toEqual({
      ...instance,
      enabled: true,
      environment: [
        ...instance.environment,
        { name: "NVIDIA_API_KEY", value: "nvapi-test", sensitive: true },
      ],
    });
  });

  it("replaces old plaintext or redacted entries instead of creating duplicates", () => {
    const instance = {
      driver: opencode,
      environment: [
        { name: "NVIDIA_API_KEY", value: "old", sensitive: false },
        { name: "NVIDIA_API_KEY", value: "", sensitive: true, valueRedacted: true },
      ],
    };
    expect(updateNvidiaKey(instance, "replacement", false).environment).toEqual([
      { name: "NVIDIA_API_KEY", value: "replacement", sensitive: true },
    ]);
  });

  it("clears only the NVIDIA key and keeps the instance disabled when not enabling", () => {
    const instance = {
      driver: opencode,
      enabled: false,
      environment: [
        { name: "NVIDIA_API_KEY", value: "", sensitive: true, valueRedacted: true },
        { name: "OTHER_SETTING", value: "kept", sensitive: false },
      ],
    };
    expect(updateNvidiaKey(instance, null, false)).toEqual({
      driver: opencode,
      enabled: false,
      environment: [{ name: "OTHER_SETTING", value: "kept", sensitive: false }],
    });
    expect(updateNvidiaKey({ driver: opencode }, null, false)).toEqual({ driver: opencode });
  });

  it("does not report success when an older server silently ignores the mutation", () => {
    const stored = { name: "NVIDIA_API_KEY", value: "", sensitive: true, valueRedacted: true };
    expect(verifyNvidiaKeyUpdate(undefined, undefined, false)).toBe("not-saved");
    expect(verifyNvidiaKeyUpdate(undefined, stored, false)).toBe("confirmed");
    expect(verifyNvidiaKeyUpdate(stored, stored, false)).toBe("unverified");
    expect(verifyNvidiaKeyUpdate(stored, stored, true)).toBe("not-saved");
    expect(verifyNvidiaKeyUpdate(stored, undefined, true)).toBe("confirmed");
  });

  it("detects external servers without treating empty or unrelated config as external", () => {
    expect(
      openCodeUsesExternalServer({ driver: opencode, config: { serverUrl: " https://oc " } }),
    ).toBe(true);
    expect(openCodeUsesExternalServer({ driver: opencode, config: { serverUrl: "  " } })).toBe(
      false,
    );
    expect(openCodeUsesExternalServer({ driver: opencode, config: null })).toBe(false);
    expect(openCodeUsesExternalServer({ driver: opencode, config: ["external"] })).toBe(false);
  });
});
