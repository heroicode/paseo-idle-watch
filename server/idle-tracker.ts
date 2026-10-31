/** Checks run on a timer that drifts, so a repeat due a moment from now counts as due. */
const REPEAT_SLACK_MS = 5_000;

export interface AgentReading {
  provider: string;
  activeAt: number;
}

export interface QuotaReading {
  id: string;
  name: string;
  readable: boolean;
  /** Each value only rises as tokens are spent, until the window resets. */
  meters: Record<string, number>;
}

export interface ProviderUse {
  id: string;
  name: string;
  lastUsedAt: number | null;
  /** The idle clock starts no earlier than this: use before it is unknown. */
  firstSeenAt: number;
  quotaReadable: boolean;
  /** Null until a quota read has answered for this provider. */
  hasQuota: boolean | null;
  lastAlertAt: number | null;
}

export interface AlertPolicy {
  idleMs: number;
  repeatMs: number;
  isWatched(id: string, hasQuota: boolean | null): boolean;
}

interface QuotaWindow {
  id: string;
  usedPct?: number | null;
  remainingPct?: number | null;
}

interface QuotaBalance {
  id: string;
  used?: number | null;
  remaining?: number | null;
}

export function quotaMeters(usage: {
  windows: QuotaWindow[];
  balances?: QuotaBalance[];
}): Record<string, number> {
  const meters: Record<string, number> = {};
  for (const win of usage.windows) {
    const used = win.usedPct ?? (win.remainingPct == null ? null : 100 - win.remainingPct);
    if (used != null) meters[`window:${win.id}`] = used;
  }
  for (const balance of usage.balances ?? []) {
    const used = balance.used ?? (balance.remaining == null ? null : -balance.remaining);
    if (used != null) meters[`balance:${balance.id}`] = used;
  }
  return meters;
}

/** `claude/claude-opus-5-5` and `Claude` are both the provider `claude`. */
function providerKey(provider: string): string {
  return (provider.split("/")[0] ?? provider).toLowerCase();
}

/**
 * Decides when each provider's tokens last moved, from two signals that cover for each other.
 * Agent activity is precise but only sees Paseo's agents. Provider quota also sees use outside
 * Paseo but moves in whole percents, so light use can go unseen for a long time.
 */
export function createIdleTracker() {
  const providers = new Map<string, ProviderUse>();
  const meters = new Map<string, Record<string, number>>();

  function entry(provider: string, now: number): ProviderUse {
    const id = providerKey(provider);
    let use = providers.get(id);
    if (!use) {
      use = {
        id,
        name: id,
        lastUsedAt: null,
        firstSeenAt: now,
        quotaReadable: false,
        hasQuota: null,
        lastAlertAt: null,
      };
      providers.set(id, use);
    }
    return use;
  }

  function recordUse(provider: string, at: number, now = at): void {
    const use = entry(provider, now);
    use.lastUsedAt = Math.max(use.lastUsedAt ?? at, at);
  }

  function isIdle(use: ProviderUse, idleMs: number, now: number): boolean {
    return now - Math.max(use.lastUsedAt ?? use.firstSeenAt, use.firstSeenAt) >= idleMs;
  }

  return {
    recordUse,

    lastUsedAt(): number | null {
      let latest: number | null = null;
      for (const { lastUsedAt: at } of providers.values()) {
        if (at !== null && (latest === null || at > latest)) latest = at;
      }
      return latest;
    },

    observeAgents(readings: AgentReading[], now: number): void {
      for (const { provider, activeAt } of readings) recordUse(provider, activeAt, now);
    },

    /** A meter that falls is a window resetting, not use. The first reading is only a baseline. */
    observeQuota(readings: QuotaReading[], now: number): void {
      const answered = new Set<string>();
      for (const reading of readings) {
        const use = entry(reading.id, now);
        answered.add(use.id);
        use.name = reading.name;
        use.quotaReadable = reading.readable;
        // An unreadable quota says nothing about whether one exists, so assume it does.
        if (!reading.readable) {
          use.hasQuota ??= true;
          continue;
        }
        use.hasQuota = Object.keys(reading.meters).length > 0;
        const previous = meters.get(use.id);
        if (previous) {
          const rose = Object.entries(reading.meters).some(
            ([id, value]) => previous[id] !== undefined && value > previous[id],
          );
          if (rose) recordUse(use.id, now);
        }
        meters.set(use.id, reading.meters);
      }
      // Paseo reports nothing for these, so there is no quota to watch.
      for (const use of providers.values()) {
        if (!answered.has(use.id)) use.hasQuota ??= false;
      }
    },

    /** Each watched provider is due when it first passes the window, then every `repeatMs` if set. */
    dueAlerts(policy: AlertPolicy, now: number): ProviderUse[] {
      return [...providers.values()].filter((use) => {
        if (!policy.isWatched(use.id, use.hasQuota) || !isIdle(use, policy.idleMs, now)) {
          use.lastAlertAt = null;
          return false;
        }
        const due =
          use.lastAlertAt === null ||
          (policy.repeatMs > 0 && now - use.lastAlertAt >= policy.repeatMs - REPEAT_SLACK_MS);
        if (due) use.lastAlertAt = now;
        return due;
      });
    },

    /** Every provider seen, most recently used first, with whether it counts as idle right now. */
    providers(policy: AlertPolicy, now: number): (ProviderUse & { idle: boolean })[] {
      return [...providers.values()]
        .map((use) => ({
          ...use,
          idle: policy.isWatched(use.id, use.hasQuota) && isIdle(use, policy.idleMs, now),
        }))
        .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0));
    },
  };
}
