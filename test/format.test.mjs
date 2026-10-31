import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDuration, formatUsage } from "../shared/format.ts";

test("lists each provider's windows, preferring the short label", () => {
  const text = formatUsage([
    {
      displayName: "Claude",
      status: "available",
      windows: [
        { label: "5-hour", shortLabel: "5h", usedPct: 40.4 },
        { label: "Weekly", remainingPct: 69 },
      ],
    },
    { displayName: "Codex", status: "available", windows: [{ label: "Session", usedPct: 2 }] },
  ]);
  assert.equal(text, "Claude: 5h 40%, Weekly 31%. Codex: Session 2%.");
});

test("never carries the account email in a provider name", () => {
  const text = formatUsage([
    { displayName: "Claude (someone@example.com)", status: "available", windows: [{ label: "Weekly", usedPct: 1 }] },
  ]);
  assert.equal(text, "Claude: Weekly 1%.");
});

test("includes balances", () => {
  const text = formatUsage([
    {
      displayName: "Kimi",
      status: "available",
      windows: [],
      balances: [
        { label: "Spend", used: 3, limit: 10 },
        { label: "Credits", remaining: 5 },
      ],
    },
  ]);
  assert.equal(text, "Kimi: Spend 3/10, Credits 5 left.");
});

test("leaves out providers with nothing to report, and is null when none remain", () => {
  const providers = [
    { displayName: "Copilot", status: "available", windows: [], balances: [] },
    { displayName: "Codex", status: "unavailable", windows: [{ label: "Session", usedPct: 9 }] },
    { displayName: "Grok", status: "available", windows: [{ label: "Day", usedPct: null }] },
  ];
  assert.equal(formatUsage(providers), null);
});

test("formats durations", () => {
  assert.equal(formatDuration(45_000), "45s");
  assert.equal(formatDuration(12 * 60_000), "12m");
  assert.equal(formatDuration(134 * 60_000), "2h 14m");
});
