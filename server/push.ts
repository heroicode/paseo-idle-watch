import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

function paseoHome(): string {
  return process.env.PASEO_HOME ?? join(homedir(), ".paseo");
}

/** Tokens whose lease has lapsed belong to devices that stopped renewing, so they get nothing. */
export function activePushTokens(store: unknown, now: number): string[] {
  const subscriptions = (store as { subscriptions?: unknown } | null)?.subscriptions;
  if (!Array.isArray(subscriptions)) return [];
  const tokens = new Set<string>();
  for (const entry of subscriptions as { token?: unknown; expiresAt?: unknown }[]) {
    if (typeof entry?.token !== "string" || typeof entry.expiresAt !== "string") continue;
    if (Date.parse(entry.expiresAt) > now) tokens.add(entry.token);
  }
  return [...tokens];
}

/**
 * Paseo has no push API for plugins, so this reads the daemon's device tokens and sends what the
 * daemon itself would send. The store belongs to the daemon: this never writes to it, and tokens
 * never go in logs or errors. Resolves to the number of devices Expo accepted.
 */
export async function sendMobilePush(title: string, body: string): Promise<number> {
  const raw = await readFile(join(paseoHome(), "push-tokens.json"), "utf8").catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "{}";
    throw error;
  });
  const tokens = activePushTokens(JSON.parse(raw), Date.now());
  if (tokens.length === 0) return 0;
  const serverId = (await readFile(join(paseoHome(), "server-id"), "utf8")).trim();

  const response = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(
      tokens.map((to) => ({ to, title, body, data: { serverId }, sound: "default" })),
    ),
  });
  if (!response.ok) throw new Error(`Expo push failed with status ${response.status}`);
  const { data } = (await response.json()) as { data: { status: string; details?: { error?: string } }[] };
  const failed = data.filter((ticket) => ticket.status !== "ok");
  if (failed.length === tokens.length) {
    throw new Error(`Expo rejected the push: ${failed[0]?.details?.error ?? "unknown error"}`);
  }
  return tokens.length - failed.length;
}
