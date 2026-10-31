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
  }),
});

export type IdleUnit = "minutes" | "hours";

export function idleWindowMs(amount: number, unit: IdleUnit): number {
  return amount * (unit === "hours" ? 3_600_000 : 60_000);
}

export const statusRpc = defineRpc({
  name: "idle.status",
  input: z.object({}),
  output: z.object({
    /** Newest token use seen on any provider, or null when none has been seen. */
    lastUsedAt: z.string().nullable(),
    /** The idle clock never starts before this: usage outside Paseo is unknown before it. */
    watchingSince: z.string(),
    quotaCheckedAt: z.string().nullable(),
    idle: z.boolean(),
    providers: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        lastUsedAt: z.string().nullable(),
        quotaReadable: z.boolean(),
      }),
    ),
  }),
});

export const testNotificationRpc = defineRpc({
  name: "idle.test-notification",
  input: z.object({}),
  output: z.object({ message: z.string(), summary: z.string() }),
});
