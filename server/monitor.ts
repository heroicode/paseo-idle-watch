import type { PluginHandlerContext, PluginSettings } from "@getpaseo/plugin/server";
import type { RpcOutput } from "@getpaseo/plugin";
import { idleSettings, idleWindowMs, type statusRpc } from "../shared/contracts";
import { formatDuration } from "../shared/format";
import { createIdleTracker, quotaMeters } from "./idle-tracker";
import { notify } from "./notify";

type Paseo = PluginHandlerContext["paseo"];

const CHECK_MS = 60_000;
/** Each quota read can reach the vendor's API, so it runs far less often than the idle check. */
const QUOTA_MS = 5 * 60_000;
const AGENT_PAGE = 200;

function iso(at: number | null): string | null {
  return at === null ? null : new Date(at).toISOString();
}

export function createMonitor(settings: PluginSettings<typeof idleSettings.schema>) {
  const watchingSince = Date.now();
  const tracker = createIdleTracker(watchingSince);
  let paseo: Paseo | null = null;
  let quotaCheckedAt: number | null = null;
  let checking = false;

  async function readAgents(client: Paseo): Promise<void> {
    const { entries } = await client.agents.list({
      filter: { includeArchived: false },
      sort: [{ key: "updated_at", direction: "desc" }],
      page: { limit: AGENT_PAGE },
    });
    tracker.observeAgents(
      entries.map(({ agent }) => ({
        provider: agent.provider,
        activeAt: new Date(agent.updatedAt).getTime(),
      })),
    );
  }

  async function readQuota(client: Paseo, now: number): Promise<void> {
    const { providers } = await client.providers.listUsage();
    tracker.observeQuota(
      providers.map((usage) => ({
        id: usage.providerId,
        name: usage.displayName,
        readable: usage.status === "available",
        meters: quotaMeters(usage),
      })),
      now,
    );
    quotaCheckedAt = now;
  }

  function alertBody(now: number): string {
    const lastUsed = tracker.lastUsedAt();
    const parts = [
      lastUsed === null
        ? `No tokens seen in the ${formatDuration(now - watchingSince)} since watching began.`
        : `No tokens used for ${formatDuration(now - lastUsed)}.`,
    ];
    if (quotaCheckedAt === null) parts.push("Use outside Paseo was not checked.");
    return parts.join(" ");
  }

  async function check(): Promise<void> {
    if (checking) return;
    checking = true;
    try {
      const now = Date.now();
      if (paseo) {
        await readAgents(paseo).catch((error) => console.warn("Reading agents failed", error));
        if (quotaCheckedAt === null || now - quotaCheckedAt >= QUOTA_MS) {
          await readQuota(paseo, now).catch((error) => console.warn("Reading quota failed", error));
        }
      }
      const state = await settings.read();
      if (state.status !== "ready") return;
      const { enabled, idleAmount, idleUnit } = state.values;
      const fire = tracker.shouldAlert(idleWindowMs(idleAmount, idleUnit), now);
      if (!fire || !enabled) return;
      const { summary, failed } = await notify("Paseo: tokens idle", alertBody(now));
      (failed ? console.warn : console.log)(`Idle window passed. ${summary}`);
    } catch (error) {
      console.warn("Idle check failed", error);
    } finally {
      checking = false;
    }
  }

  const timer = setInterval(() => void check(), CHECK_MS);
  const stopWatchingSettings = settings.subscribe(() => check());

  return {
    /**
     * The runtime only hands out its client through RPCs and hooks, so quota and agent readings
     * begin at the first of those. The timer runs regardless: until then no Paseo agent has run
     * (its turn would have attached), so the idle clock is still right for Paseo's own use.
     */
    attach(client: Paseo): void {
      if (paseo) return;
      paseo = client;
      void check();
    },

    recordUse(provider: string): void {
      tracker.recordUse(provider, Date.now());
    },

    async status(): Promise<RpcOutput<typeof statusRpc>> {
      const state = await settings.read();
      const idleMs =
        state.status === "ready"
          ? idleWindowMs(state.values.idleAmount, state.values.idleUnit)
          : Number.POSITIVE_INFINITY;
      return {
        lastUsedAt: iso(tracker.lastUsedAt()),
        watchingSince: new Date(watchingSince).toISOString(),
        quotaCheckedAt: iso(quotaCheckedAt),
        idle: tracker.isIdle(idleMs, Date.now()),
        providers: tracker.providers().map((use) => ({
          id: use.id,
          name: use.name,
          lastUsedAt: iso(use.lastUsedAt),
          quotaReadable: use.quotaReadable,
        })),
      };
    },

    stop(): void {
      clearInterval(timer);
      stopWatchingSettings();
    },
  };
}
