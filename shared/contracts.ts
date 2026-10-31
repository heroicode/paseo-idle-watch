import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const idleSettings = defineSettings({
  id: "idle",
  scope: "host",
  version: 1,
  schema: z.object({
    enabled: z.boolean().default(true),
    idleAmount: z.number().positive().default(2),
    idleUnit: z.enum(["minutes", "hours"]).default("hours"),
    /** How often to alert again while still idle. 0 alerts once per idle stretch. */
    repeatMinutes: z.number().int().min(0).default(0),
    /** Provider id to on or off. Providers not listed follow `isWatched`'s default. */
    providerOverrides: z.record(z.string(), z.boolean()).default({}),
  }),
});

export type IdleUnit = "minutes" | "hours";

export function idleWindowMs(amount: number, unit: IdleUnit): number {
  return amount * (unit === "hours" ? 3_600_000 : 60_000);
}

/** Off by default only once a provider is known to have no quota, so none goes unwatched by accident. */
export function isWatched(
  overrides: Record<string, boolean>,
  id: string,
  hasQuota: boolean | null,
): boolean {
  return overrides[id] ?? hasQuota !== false;
}

export const statusRpc = defineRpc({
  name: "idle.status",
  input: z.object({}),
  output: z.object({
    /** Newest token use seen on any provider, or null when none has been seen. */
    lastUsedAt: z.string().nullable(),
    quotaCheckedAt: z.string().nullable(),
    providers: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        lastUsedAt: z.string().nullable(),
        quotaReadable: z.boolean(),
        /** Null until a quota read has answered for this provider. */
        hasQuota: z.boolean().nullable(),
        idle: z.boolean(),
      }),
    ),
  }),
});

export const testNotificationRpc = defineRpc({
  name: "idle.test-notification",
  input: z.object({}),
  output: z.object({ message: z.string(), summary: z.string() }),
});
