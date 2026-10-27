import { isAtomCommandInterrupted } from "@t3tools/client-runtime/state/runtime";
import type { ProviderInstanceConfig, ServerProvider } from "@t3tools/contracts";
import { useRef, useState } from "react";
import { TextInput, View } from "react-native";

import { AppText as Text } from "../../components/ui/AppText";
import * as Dialog from "../../components/ui/Dialog";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { SettingsActionRow } from "./components/SettingsActionRow";
import {
  NVIDIA_API_KEY_NAME,
  openCodeUsesExternalServer,
  updateNvidiaKey,
  verifyNvidiaKeyUpdate,
} from "./nvidiaSetup";
import type { SettingsTarget } from "./settings-environment-filter";

export function NvidiaOpenCodeSettings({
  environment,
  provider,
}: {
  readonly environment: SettingsTarget;
  readonly provider: ServerProvider;
}) {
  const instanceId = provider.instanceId;
  const instance: ProviderInstanceConfig = environment.serverConfig.settings.providerInstances[
    instanceId
  ] ?? { driver: provider.driver };
  const currentKey = instance.environment?.find(
    (variable) => variable.name === NVIDIA_API_KEY_NAME,
  );
  const configured = Boolean(currentKey?.valueRedacted || currentKey?.value);
  const external = openCodeUsesExternalServer(instance);
  const mutate = useAtomCommand(serverEnvironment.mutateProviderInstance, {
    reportFailure: false,
    reportDefect: false,
  });
  const refresh = useAtomCommand(serverEnvironment.refreshProviders, {
    reportFailure: false,
    reportDefect: false,
  });
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(key: string | null) {
    if (pendingRef.current || (key !== null && (external || !key.trim()))) return;
    pendingRef.current = true;
    setPending(true);
    setNotice(null);
    setError(null);
    let changeAcknowledged = false;
    let replacementUnverified = false;
    try {
      const next = updateNvidiaKey(instance, key, key !== null);
      const result = await mutate({
        environmentId: environment.environmentId,
        input: {
          patch: {},
          providerInstanceMutation: { operation: "upsert", instanceId, instance: next },
        },
      });
      if (result._tag === "Failure") {
        if (!isAtomCommandInterrupted(result)) {
          setError("Could not save the NVIDIA key. Check the connection and provider permissions.");
        }
        return;
      }
      const savedKey = result.value.providerInstances[instanceId]?.environment?.find(
        (variable) => variable.name === NVIDIA_API_KEY_NAME,
      );
      const verification = verifyNvidiaKeyUpdate(currentKey, savedKey, key === null);
      if (verification === "not-saved") {
        setError("The server did not save this change. Update the T3 Code server and try again.");
        return;
      }
      changeAcknowledged = true;
      replacementUnverified = verification === "unverified";
      setDraft("");
      const refreshed = await refresh({
        environmentId: environment.environmentId,
        input: { instanceId, refreshModels: true, fresh: true },
      });
      const changeNotice = replacementUnverified
        ? "The server acknowledged the request, but the redacted response cannot confirm the replacement. Test the new key in a thread."
        : key === null
          ? "NVIDIA key removed."
          : "NVIDIA key saved. Choose an NVIDIA model in your thread.";
      setNotice(
        refreshed._tag === "Success"
          ? `${changeNotice} Provider refreshed.`
          : `${changeNotice} Model refresh failed; refresh from the thread settings.`,
      );
    } catch {
      setError(
        changeAcknowledged
          ? replacementUnverified
            ? "The server acknowledged the request, but the replacement could not be verified and model refresh failed."
            : "The key change was saved, but model refresh failed."
          : "Could not save the NVIDIA key. Check the connection and provider permissions.",
      );
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <View className="border-b border-border-subtle">
      <View className="gap-2 p-4">
        <Text className="text-lg font-semibold text-foreground">
          {provider.displayName ?? "OpenCode"} · NVIDIA Build
        </Text>
        <Text className="text-sm text-foreground-muted">
          {external
            ? "This instance uses an external OpenCode server. Set NVIDIA_API_KEY on that server instead."
            : "Enter an NVIDIA Build API key to use its models through OpenCode. The key is stored on the connected T3 server, not on this phone. Use a trusted, encrypted connection. The key is validated when you run a model."}
        </Text>
        {!provider.installed && !external ? (
          <Text className="text-sm text-foreground-muted">
            Install OpenCode on the server before starting a thread.
          </Text>
        ) : null}
        {configured && currentKey?.sensitive === false ? (
          <Text className="text-sm text-danger-foreground">
            This key was saved as non-sensitive. Replace it here to store it as sensitive.
          </Text>
        ) : configured ? (
          <Text className="text-sm text-foreground-muted">A key is stored for this instance.</Text>
        ) : null}
        {!external ? (
          <TextInput
            accessibilityLabel="NVIDIA Build API key"
            className="rounded-lg border border-border-subtle px-3 py-2 text-base text-foreground"
            placeholderTextColorClassName="accent-foreground-muted"
            placeholder={configured ? "Enter a replacement key" : "Paste your NVIDIA API key"}
            secureTextEntry
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!pending}
            value={draft}
            onChangeText={setDraft}
          />
        ) : null}
        {notice ? (
          <Text accessibilityLiveRegion="polite" className="text-sm text-foreground-muted">
            {notice}
          </Text>
        ) : null}
        {error ? (
          <Text accessibilityRole="alert" className="text-danger-foreground">
            {error}
          </Text>
        ) : null}
      </View>
      {!external ? (
        <SettingsActionRow
          label={provider.enabled ? "Save NVIDIA key" : "Save key and enable OpenCode"}
          disabled={pending || !draft.trim()}
          loading={pending}
          onPress={() => void save(draft)}
        />
      ) : null}
      {configured ? (
        <SettingsActionRow
          label="Remove NVIDIA key"
          tone="danger"
          disabled={pending}
          onPress={() =>
            Dialog.confirm({
              title: "Remove NVIDIA key?",
              message: `This removes the key saved for ${provider.displayName ?? "OpenCode"} on ${environment.label}.`,
              confirmText: "Remove",
              destructive: true,
              onConfirm: () => void save(null),
            })
          }
        />
      ) : null}
    </View>
  );
}
