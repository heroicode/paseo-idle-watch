import type { PluginServerContext } from "@getpaseo/plugin/server";
import { idleSettings, statusRpc, testNotificationRpc } from "./shared/contracts";
import { createMonitor } from "./server/monitor";
import { postDesktopNotification } from "./server/notify";

export default function contribute(server: PluginServerContext) {
  const monitor = createMonitor(server.registerSettings(idleSettings));

  server.handle(statusRpc, async (_input, { paseo }) => {
    monitor.attach(paseo);
    return monitor.status();
  });

  server.handle(testNotificationRpc, async () => {
    try {
      await postDesktopNotification("Paseo: tokens idle", "Test notification from Idle watch.");
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });

  const removeStarted = server.on("agent.turn_started", async ({ agent }, { paseo }) => {
    monitor.attach(paseo);
    monitor.recordUse(agent.provider);
  });
  const removeEnded = server.on("agent.turn_ended", async ({ agent }, { paseo }) => {
    monitor.attach(paseo);
    monitor.recordUse(agent.provider);
  });

  return () => {
    removeStarted();
    removeEnded();
    monitor.stop();
  };
}
