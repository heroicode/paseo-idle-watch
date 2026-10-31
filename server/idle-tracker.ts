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
  quotaReadable: boolean;
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
 * Decides when tokens last moved, from two signals that cover for each other. Agent activity is
 * precise but only sees Paseo's agents. Provider quota also sees use outside Paseo but moves in
 * whole percents, so light use can go unseen for a long time.
 */
export function createIdleTracker(watchingSince: number) {
  const providers = new Map<string, ProviderUse>();
  const meters = new Map<string, Record<string, number>>();
  let alerted = false;

  function entry(provider: string): ProviderUse {
    const id = providerKey(provider);
    let use = providers.get(id);
    if (!use) {
      use = { id, name: id, lastUsedAt: null, quotaReadable: false };
      providers.set(id, use);
    }
    return use;
  }

  function recordUse(provider: string, at: number): void {
    const use = entry(provider);
    use.lastUsedAt = Math.max(use.lastUsedAt ?? at, at);
  }

  function lastUsedAt(): number | null {
    let latest: number | null = null;
    for (const { lastUsedAt: at } of providers.values()) {
      if (at !== null && (latest === null || at > latest)) latest = at;
    }
    return latest;
  }

  function isIdle(idleMs: number, now: number): boolean {
    return now - Math.max(lastUsedAt() ?? watchingSince, watchingSince) >= idleMs;
  }

  return {
    recordUse,
    lastUsedAt,
    isIdle,

    observeAgents(readings: AgentReading[]): void {
      for (const { provider, activeAt } of readings) recordUse(provider, activeAt);
    },

    /** A meter that falls is a window resetting, not use. The first reading is only a baseline. */
    observeQuota(readings: QuotaReading[], now: number): void {
      for (const reading of readings) {
        const use = entry(reading.id);
        use.name = reading.name;
        use.quotaReadable = reading.readable;
        if (!reading.readable) continue;
        const previous = meters.get(use.id);
        if (previous) {
          const rose = Object.entries(reading.meters).some(
            ([id, value]) => previous[id] !== undefined && value > previous[id],
          );
          if (rose) recordUse(use.id, now);
        }
        meters.set(use.id, reading.meters);
      }
    },

    /** True once per idle stretch: on the check that first finds the window has passed. */
    shouldAlert(idleMs: number, now: number): boolean {
      const idle = isIdle(idleMs, now);
      const fire = idle && !alerted;
      alerted = idle;
      return fire;
    },

    /** Providers worth showing: ones with use seen, or whose quota can be read. */
    providers(): ProviderUse[] {
      return [...providers.values()]
        .filter((use) => use.lastUsedAt !== null || use.quotaReadable)
        .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0));
    },
  };
}
