import { describe, expect, it } from "vite-plus/test";
import { ProviderDriverKind, type ServerProviderModel } from "@t3tools/contracts";

import {
  deriveProviderModelsForDisplay,
  nextProviderEnvironmentWithFieldValue,
  providerEnvironmentFieldDescription,
} from "./ProviderInstanceCard";
import { providerClients } from "./providerDriverMeta";

describe("deriveProviderModelsForDisplay", () => {
  it("uses current config custom models instead of stale live custom rows", () => {
    const liveModels: ReadonlyArray<ServerProviderModel> = [
      {
        slug: "server-model",
        name: "Server Model",
        isCustom: false,
        capabilities: null,
      },
      {
        slug: "removed-custom",
        name: "Removed Custom",
        isCustom: true,
        capabilities: null,
      },
      {
        slug: "kept-custom",
        name: "Kept Custom",
        isCustom: true,
        capabilities: null,
      },
    ];

    expect(
      deriveProviderModelsForDisplay({
        liveModels,
        customModels: [{ slug: "kept-custom", name: "kept-custom", capabilities: null }],
      }).map((model) => model.slug),
    ).toEqual(["server-model", "kept-custom"]);
  });
});

describe("provider environment helpers", () => {
  it("adds, replaces, and clears the NVIDIA key without changing other providers", () => {
    const nvidia = providerClients
      .get(ProviderDriverKind.make("opencode"))
      ?.environmentFields?.find((field) => field.name === "NVIDIA_API_KEY");
    expect(nvidia).toBeDefined();
    if (!nvidia) throw new Error("NVIDIA setup field is missing");
    const otherProviders = [{ name: "OPENAI_API_KEY", value: "other-key", sensitive: true }];
    const added = nextProviderEnvironmentWithFieldValue(otherProviders, nvidia, " nvapi-test ");
    expect(added).toEqual([
      ...otherProviders,
      { name: "NVIDIA_API_KEY", value: "nvapi-test", sensitive: true },
    ]);

    const replaced = nextProviderEnvironmentWithFieldValue(
      [
        ...otherProviders,
        { name: "NVIDIA_API_KEY", value: "", sensitive: true, valueRedacted: true },
      ],
      nvidia,
      "new-nvidia-key",
    );
    expect(replaced).toEqual([
      ...otherProviders,
      { name: "NVIDIA_API_KEY", value: "new-nvidia-key", sensitive: true },
    ]);
    expect(nextProviderEnvironmentWithFieldValue(replaced, nvidia, "")).toEqual(otherProviders);

    const existingPlaintext = [
      ...otherProviders,
      { name: "NVIDIA_API_KEY", value: "nvapi-test", sensitive: false },
    ];
    expect(nextProviderEnvironmentWithFieldValue(existingPlaintext, nvidia, "nvapi-test")).toEqual(
      added,
    );
    expect(providerEnvironmentFieldDescription(nvidia, existingPlaintext[1])).toContain(
      "Previously saved as non-sensitive",
    );
    expect(providerEnvironmentFieldDescription(nvidia, added[1])).toBe(nvidia.description);
    expect(providerEnvironmentFieldDescription(nvidia, undefined)).toBe(nvidia.description);
    expect(
      providerEnvironmentFieldDescription({ ...nvidia, sensitive: false }, existingPlaintext[1]),
    ).toBe(nvidia.description);
  });

  const cursorApiKeyField = {
    name: "CURSOR_API_KEY",
    label: "Cursor API key",
    sensitive: true,
  };

  it("writes dedicated provider secrets as sensitive environment variables", () => {
    expect(
      nextProviderEnvironmentWithFieldValue(
        [{ name: "EXTRA_FLAG", value: "1", sensitive: false }],
        cursorApiKeyField,
        "  cursor-key  ",
      ),
    ).toEqual([
      { name: "EXTRA_FLAG", value: "1", sensitive: false },
      { name: "CURSOR_API_KEY", value: "cursor-key", sensitive: true },
    ]);
  });

  it("replaces redacted provider secrets without preserving redaction markers", () => {
    expect(
      nextProviderEnvironmentWithFieldValue(
        [
          {
            name: "CURSOR_API_KEY",
            value: "",
            sensitive: true,
            valueRedacted: true,
          },
        ],
        cursorApiKeyField,
        "new-key",
      ),
    ).toEqual([{ name: "CURSOR_API_KEY", value: "new-key", sensitive: true }]);
  });

  it("applies the secure field default when replacing an existing non-sensitive value", () => {
    expect(
      nextProviderEnvironmentWithFieldValue(
        [{ name: "OPENAI_API_KEY", value: "old-key", sensitive: false }],
        {
          name: "OPENAI_API_KEY",
          label: "OpenAI API key",
        },
        "new-key",
      ),
    ).toEqual([{ name: "OPENAI_API_KEY", value: "new-key", sensitive: true }]);
  });
});
