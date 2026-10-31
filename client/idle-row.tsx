import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { formatDuration, providerLabel } from "../shared/format";
import { useIdleStatus, type IdleStatus } from "./idle-status";

function ago(iso: string): string {
  return formatDuration(Date.now() - new Date(iso).getTime());
}

function rowLabel(status: IdleStatus | null): string {
  if (!status) return "Tokens";
  const idle = status.providers.filter((provider) => provider.idle);
  if (idle.length > 1) return `${idle.length} providers idle`;
  const [only] = idle;
  if (only) {
    const name = providerLabel(only.name);
    return only.lastUsedAt ? `${name} idle ${ago(only.lastUsedAt)}` : `${name} idle`;
  }
  return status.lastUsedAt ? `Tokens used ${ago(status.lastUsedAt)} ago` : "No tokens seen";
}

export function createIdleRow(openSettings: () => void) {
  return function IdleRow() {
    const status = useIdleStatus();
    return (
      <SidebarRow
        icon={status?.providers.some((provider) => provider.idle) ? "BellRing" : "Activity"}
        label={rowLabel(status)}
        onPress={openSettings}
      />
    );
  };
}
