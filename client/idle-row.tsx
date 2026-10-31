import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { formatDuration } from "../shared/format";
import { useIdleStatus, type IdleStatus } from "./idle-status";

function rowLabel(status: IdleStatus | null): string {
  if (!status) return "Tokens";
  if (!status.lastUsedAt) return "No tokens seen";
  const ago = formatDuration(Date.now() - new Date(status.lastUsedAt).getTime());
  return status.idle ? `No tokens for ${ago}` : `Tokens used ${ago} ago`;
}

export function createIdleRow(openSettings: () => void) {
  return function IdleRow() {
    const status = useIdleStatus();
    return (
      <SidebarRow
        icon={status?.idle ? "BellRing" : "Activity"}
        label={rowLabel(status)}
        onPress={openSettings}
      />
    );
  };
}
