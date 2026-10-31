import type { PluginHandlerContext, PluginSettings } from "@getpaseo/plugin/server";
import type { RpcOutput } from "@getpaseo/plugin";
import { idleSettings, idleWindowMs, isWatched, type statusRpc } from "../shared/contracts";
import { formatDuration, formatUsage, providerLabel } from "../shared/format";
import { createIdleTracker, quotaMeters, type AlertPolicy, type ProviderUse } from "./idle-tracker";
import { notify } from "./notify";

type Paseo = PluginHandlerContext["paseo"];

const CHECK_MS = 60_000;
/** Each quota read can reach the vendor's API, so it runs far less often than the idle check. */
const QUOTA_MS = 5 * 60_000;
const AGENT_PAGE = 200;

const NOTHING_IDLE: AlertPolicy = {
  idleMs: Number.POSITIVE_INFINITY,
  repeatMs: 0,
  isWatched: () => false,
};

function iso(at: number | null): string | null {
  return at === null ? null : new Date(at).toISOString();
}

export function createMonitor(settings: PluginSettings<typeof idleSettings.schema>) {
  const tracker = createIdleTracker();
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
      Date.now(),
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

  async function readPolicy(): Promise<(AlertPolicy & { enabled: boolean }) | null> {
    const state = await settings.read();
    if (state.status !== "ready") return null;
    const { enabled, idleAmount, idleUnit, repeatMinutes, providerOverrides } = state.values;
    return {
      enabled,
      idleMs: idleWindowMs(idleAmount, idleUnit),
      repeatMs: repeatMinutes * 60_000,
      isWatched: (id, hasQuota) => isWatched(providerOverrides, id, hasQuota),
    };
  }

  function alertBody(due: ProviderUse[], now: number): string {
    return due
      .map((use) => {
        const idleFor = formatDuration(now - (use.lastUsedAt ?? use.firstSeenAt));
        const note = use.quotaReadable ? "" : " (quota not readable)";
        return `${providerLabel(use.name)} idle for ${idleFor}${note}.`;
      })
      .join(" ");
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
      const policy = await readPolicy();
      if (!policy) return;
      const due = tracker.dueAlerts(policy, now);
      if (due.length === 0 || !policy.enabled) return;
      const { summary, failed } = await notify("Paseo: tokens idle", alertBody(due, now));
      const ids = due.map((use) => use.id).join(", ");
      (failed ? console.warn : console.log)(`Idle: ${ids}. ${summary}`);
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
     * begin at the first of those. Until then no provider is known, so nothing can alert.
     */
    attach(client: Paseo): void {
      if (paseo) return;
      paseo = client;
      void check();
    },

    recordUse(provider: string): void {
      tracker.recordUse(provider, Date.now());
    },

    /** Reads quota now rather than reporting the last poll, since the numbers are the point. */
    async usageMessage(client: Paseo): Promise<string> {
      const usage = await client.providers
        .listUsage()
        .then(({ providers }) => formatUsage(providers))
        .catch((error) => {
          console.warn("Reading quota failed", error);
          return null;
        });
      const lastUsed = tracker.lastUsedAt();
      const seen =
        lastUsed === null ? "No token use seen yet." : `Last used ${formatDuration(Date.now() - lastUsed)} ago.`;
      return `${usage ?? "Usage could not be read."} ${seen}`;
    },

    async status(): Promise<RpcOutput<typeof statusRpc>> {
      const now = Date.now();
      const policy = (await readPolicy()) ?? NOTHING_IDLE;
      return {
        lastUsedAt: iso(tracker.lastUsedAt()),
        quotaCheckedAt: iso(quotaCheckedAt),
        providers: tracker.providers(policy, now).map((use) => ({
          id: use.id,
          name: use.name,
          lastUsedAt: iso(use.lastUsedAt),
          quotaReadable: use.quotaReadable,
          hasQuota: use.hasQuota,
          idle: use.idle,
        })),
      };
    },

    stop(): void {
      clearInterval(timer);
      stopWatchingSettings();
    },
  };
}
