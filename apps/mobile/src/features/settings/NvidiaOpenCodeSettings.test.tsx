import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { mocks } = vi.hoisted(() => ({
  mocks: { mutate: vi.fn(), refresh: vi.fn(), confirm: vi.fn() },
}));
vi.mock("react-native", () => ({
  View: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TextInput: ({
    onChangeText,
    secureTextEntry,
    accessibilityLabel,
    value,
  }: {
    onChangeText: (value: string) => void;
    secureTextEntry: boolean;
    accessibilityLabel: string;
    value: string;
  }) => (
    <input
      type={secureTextEntry ? "password" : "text"}
      aria-label={accessibilityLabel}
      value={value}
      onChange={(event) => onChangeText(event.currentTarget.value)}
    />
  ),
}));
vi.mock("../../components/ui/AppText", () => ({
  AppText: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock("../../components/ui/Dialog", () => ({ confirm: mocks.confirm }));
vi.mock("../../state/server", () => ({
  serverEnvironment: { mutateProviderInstance: "mutate", refreshProviders: "refresh" },
}));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (command: string) => (command === "mutate" ? mocks.mutate : mocks.refresh),
}));
vi.mock("./components/SettingsActionRow", () => ({
  SettingsActionRow: ({
    label,
    disabled,
    onPress,
  }: {
    label: string;
    disabled?: boolean;
    onPress: () => void;
  }) => (
    <button disabled={disabled} onClick={onPress}>
      {label}
    </button>
  ),
}));

import { NvidiaOpenCodeSettings } from "./NvidiaOpenCodeSettings";

let root: Root;
let container: HTMLDivElement;
const stored = { name: "NVIDIA_API_KEY", value: "", sensitive: true, valueRedacted: true };
const other = { name: "OTHER_KEY", value: "", sensitive: true, valueRedacted: true };
const instance: {
  driver: string;
  enabled: boolean;
  config: Record<string, string>;
  environment: Array<typeof other>;
} = { driver: "opencode", enabled: false, config: { binaryPath: "oc" }, environment: [other] };
const environment = (specific = instance) => ({
  environmentId: "local",
  label: "Local",
  serverConfig: { settings: { providerInstances: { opencode: specific } } },
});
const provider = {
  instanceId: "opencode",
  driver: "opencode",
  displayName: "OpenCode",
  enabled: false,
  installed: true,
};

function render(target = environment()) {
  act(() =>
    root.render(
      <NvidiaOpenCodeSettings environment={target as never} provider={provider as never} />,
    ),
  );
}
function typeKey(value: string) {
  const input = container.querySelector<HTMLInputElement>(
    'input[aria-label="NVIDIA Build API key"]',
  )!;
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function save() {
  const button = [...container.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("Save"),
  )!;
  await act(async () => {
    button.click();
    await Promise.resolve();
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  root = createRoot(container);
  mocks.mutate.mockReset();
  mocks.refresh.mockReset();
  mocks.confirm.mockReset();
  mocks.mutate.mockResolvedValue({
    _tag: "Success",
    value: {
      providerInstances: { opencode: { ...instance, enabled: true, environment: [other, stored] } },
    },
  });
  mocks.refresh.mockResolvedValue({ _tag: "Success", value: [] });
});
afterEach(() => act(() => root.unmount()));

describe("NVIDIA mobile setup", () => {
  it("masks and saves the key on the selected instance while retaining other secrets", async () => {
    render();
    expect(container.querySelector("input")?.type).toBe("password");
    typeKey(" nvapi-test ");
    await save();
    expect(mocks.mutate).toHaveBeenCalledOnce();
    expect(mocks.mutate.mock.calls[0]![0]).toEqual({
      environmentId: "local",
      input: {
        patch: {},
        providerInstanceMutation: {
          operation: "upsert",
          instanceId: "opencode",
          instance: {
            ...instance,
            enabled: true,
            environment: [other, { name: "NVIDIA_API_KEY", value: "nvapi-test", sensitive: true }],
          },
        },
      },
    });
    expect(mocks.refresh).toHaveBeenCalledWith({
      environmentId: "local",
      input: { instanceId: "opencode", fresh: true, refreshModels: true },
    });
    expect(container.querySelector("input")?.value).toBe("");
    expect(container.textContent).toContain("NVIDIA key saved");
  });
  it("does not offer to inject a key into an external OpenCode server", () => {
    render(environment({ ...instance, config: { serverUrl: "https://remote.example" } }));
    expect(container.querySelector("input")).toBeNull();
    expect(container.textContent).toContain("external OpenCode server");
  });
  it("does not claim success when a server ignores the new mutation", async () => {
    mocks.mutate.mockResolvedValue({ _tag: "Success", value: { providerInstances: {} } });
    render();
    typeKey("nvapi-test");
    await save();
    expect(container.textContent).toContain("server did not save");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("reports a redacted replacement as unverified", async () => {
    render(environment({ ...instance, environment: [other, stored] }));
    typeKey("replacement");
    await save();
    expect(container.textContent).toContain("cannot confirm the replacement");
    expect(container.textContent).not.toContain("NVIDIA key saved");
  });
  it("reports a refresh failure separately from the confirmed save", async () => {
    mocks.refresh.mockResolvedValue({ _tag: "Failure", cause: {} });
    render();
    typeKey("nvapi-test");
    await save();
    expect(container.textContent).toContain("NVIDIA key saved");
    expect(container.textContent).toContain("Model refresh failed");
  });
  it("recovers from a rejected mutation so the user can retry", async () => {
    mocks.mutate.mockRejectedValueOnce(new Error("offline"));
    render();
    typeKey("nvapi-test");
    await save();
    expect(container.textContent).toContain("Could not save");
    await save();
    expect(mocks.mutate).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("NVIDIA key saved");
  });
  it("reports a rejected refresh without denying the saved key", async () => {
    mocks.refresh.mockRejectedValueOnce(new Error("offline"));
    render();
    typeKey("nvapi-test");
    await save();
    expect(container.textContent).toContain("NVIDIA key saved");
    expect(container.textContent).toContain("Model refresh failed");
  });
});
