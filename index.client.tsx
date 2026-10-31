import type { PluginClientContext } from "@getpaseo/plugin/client";
import { createIdleRow } from "./client/idle-row";
import { SettingsScreen } from "./client/settings-screen";
import { statusRpc } from "./shared/contracts";

const SETTINGS_ID = "settings";

export default function contribute(client: PluginClientContext) {
  const removeSettings = client.addSettingsScreen({
    id: SETTINGS_ID,
    title: "Idle watch",
    icon: "BellRing",
    Component: SettingsScreen,
  });
  const removeRow = client.addSidebarFooterItem({
    id: "idle",
    title: "Idle watch",
    Component: createIdleRow(() => client.openSettings(SETTINGS_ID)),
  });
  // The row can be hidden, so connect here too: this is what gives the daemon side its client.
  void client.rpc(statusRpc, {}).catch(() => {});

  return () => {
    removeRow();
    removeSettings();
  };
}
