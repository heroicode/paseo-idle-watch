/** "45s", "12m", "2h 14m", "3d 2h". */
export function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return `${Math.max(0, Math.floor(ms / 1000))}s`;
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return hours % 24 ? `${days}d ${hours % 24}h` : `${days}d`;
}

interface UsageSummaryInput {
  displayName: string;
  status: string;
  windows: { label: string; shortLabel?: string; usedPct?: number | null; remainingPct?: number | null }[];
  balances?: { label: string; used?: number | null; remaining?: number | null; limit?: number | null }[];
}

function balanceText({ label, used, remaining, limit }: NonNullable<UsageSummaryInput["balances"]>[number]) {
  if (used != null && limit != null) return `${label} ${used}/${limit}`;
  if (remaining != null) return `${label} ${remaining} left`;
  return used != null ? `${label} ${used} used` : null;
}

/**
 * "Claude: 5h 40%, Weekly 31%. Codex: 5h 2%." Providers with nothing to report are left out.
 * Display names can carry the account's email, which must not reach a notification service.
 */
export function formatUsage(providers: UsageSummaryInput[]): string | null {
  const lines: string[] = [];
  for (const provider of providers) {
    if (provider.status !== "available") continue;
    const items = provider.windows.flatMap((win) => {
      const used = win.usedPct ?? (win.remainingPct == null ? null : 100 - win.remainingPct);
      return used == null ? [] : [`${win.shortLabel || win.label} ${Math.round(used)}%`];
    });
    for (const balance of provider.balances ?? []) {
      const text = balanceText(balance);
      if (text) items.push(text);
    }
    if (items.length > 0) lines.push(`${provider.displayName.replace(/\s*\(.*\)\s*$/, "")}: ${items.join(", ")}.`);
  }
  return lines.length > 0 ? lines.join(" ") : null;
}
