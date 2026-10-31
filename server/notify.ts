import { execCommand } from "@getpaseo/plugin/server";
import { sendMobilePush } from "./push";

/** Paseo gives plugins no notification API, so this posts to the desktop of the daemon's host. */
async function postDesktopNotification(title: string, body: string): Promise<void> {
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

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Sends to every channel, so one failing never stops the other. Resolves to a one-line result. */
export async function notify(title: string, body: string): Promise<{ summary: string; failed: boolean }> {
  const [desktop, mobile] = await Promise.allSettled([
    postDesktopNotification(title, body),
    sendMobilePush(title, body),
  ]);
  const parts = [
    desktop.status === "fulfilled" ? "Desktop sent" : `Desktop failed: ${message(desktop.reason)}`,
    mobile.status === "rejected"
      ? `Mobile failed: ${message(mobile.reason)}`
      : mobile.value === 0
        ? "No mobile device registered"
        : `Mobile sent to ${mobile.value} device${mobile.value === 1 ? "" : "s"}`,
  ];
  return {
    summary: parts.join(". "),
    failed: desktop.status === "rejected" || mobile.status === "rejected",
  };
}
