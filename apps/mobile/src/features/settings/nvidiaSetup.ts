import type {
  ProviderInstanceConfig,
  ProviderInstanceEnvironmentVariable,
} from "@t3tools/contracts";

export const NVIDIA_API_KEY_NAME = "NVIDIA_API_KEY";

/** A redacted replacement is indistinguishable from an older server ignoring the mutation. */
export function verifyNvidiaKeyUpdate(
  previous: ProviderInstanceEnvironmentVariable | undefined,
  returned: ProviderInstanceEnvironmentVariable | undefined,
  removing: boolean,
): "confirmed" | "unverified" | "not-saved" {
  if (removing) return returned ? "not-saved" : "confirmed";
  if (!returned?.sensitive || !returned.valueRedacted) return "not-saved";
  return previous?.sensitive && previous.valueRedacted ? "unverified" : "confirmed";
}

export function openCodeUsesExternalServer(instance: ProviderInstanceConfig): boolean {
  const config = instance.config;
  if (config === null || typeof config !== "object" || Array.isArray(config)) return false;
  const serverUrl = (config as Record<string, unknown>).serverUrl;
  return typeof serverUrl === "string" && serverUrl.trim().length > 0;
}

export function updateNvidiaKey(
  instance: ProviderInstanceConfig,
  key: string | null,
  enable: boolean,
): ProviderInstanceConfig {
  const environment = (instance.environment ?? []).filter(
    (variable) => variable.name !== NVIDIA_API_KEY_NAME,
  );
  const trimmed = key?.trim() ?? "";
  if (trimmed) environment.push({ name: NVIDIA_API_KEY_NAME, value: trimmed, sensitive: true });
  const { environment: _previous, ...rest } = instance;
  return {
    ...rest,
    ...(enable ? { enabled: true } : {}),
    ...(environment.length > 0 ? { environment } : {}),
  };
}
