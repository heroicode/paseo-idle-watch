import { execCommand } from "@getpaseo/plugin/server";

/** Paseo gives plugins no notification API, so this posts to the desktop of the daemon's host. */
export async function postDesktopNotification(title: string, body: string): Promise<void> {
  if (process.platform !== "darwin") {
    throw new Error(`Desktop notifications are not supported on ${process.platform}`);
  }
  // Text travels as argv so nothing in it can be read as AppleScript.
  await execCommand(
    "osascript",
    [
      "-e", "on run argv",
      "-e", "display notification (item 2 of argv) with title (item 1 of argv)",
      "-e", "end run",
      title,
      body,
    ],
    { timeout: 10_000 },
  );
}
