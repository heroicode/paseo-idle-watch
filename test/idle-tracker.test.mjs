import assert from "node:assert/strict";
import { test } from "node:test";
import { createIdleTracker, quotaMeters } from "../server/idle-tracker.ts";

const MIN = 60_000;
const quota = (pct, extra = {}) => [
  { id: "claude", name: "Claude", readable: true, meters: { "window:5h": pct }, ...extra },
];

test("does not alert before the window passes, counted from when watching began", () => {
  const tracker = createIdleTracker(100 * MIN);
  tracker.observeAgents([{ provider: "claude", activeAt: 0 }]);
  assert.equal(tracker.shouldAlert(30 * MIN, 129 * MIN), false);
  assert.equal(tracker.shouldAlert(30 * MIN, 130 * MIN), true);
});

test("alerts once per idle stretch and rearms after use", () => {
  const tracker = createIdleTracker(0);
  assert.equal(tracker.shouldAlert(10 * MIN, 10 * MIN), true);
  assert.equal(tracker.shouldAlert(10 * MIN, 11 * MIN), false);
  assert.equal(tracker.shouldAlert(10 * MIN, 500 * MIN), false);
  tracker.recordUse("claude", 501 * MIN);
  assert.equal(tracker.shouldAlert(10 * MIN, 502 * MIN), false);
  assert.equal(tracker.shouldAlert(10 * MIN, 511 * MIN), true);
});

test("any provider's use keeps the whole watch from alerting", () => {
  const tracker = createIdleTracker(0);
  tracker.recordUse("claude", 1 * MIN);
  tracker.recordUse("codex", 50 * MIN);
  assert.equal(tracker.shouldAlert(30 * MIN, 60 * MIN), false);
  assert.equal(tracker.lastUsedAt(), 50 * MIN);
});

test("a rising quota meter counts as use, seen at the time of the reading", () => {
  const tracker = createIdleTracker(0);
  tracker.observeQuota(quota(10), 5 * MIN);
  assert.equal(tracker.lastUsedAt(), null);
  tracker.observeQuota(quota(10), 10 * MIN);
  assert.equal(tracker.lastUsedAt(), null);
  tracker.observeQuota(quota(11), 15 * MIN);
  assert.equal(tracker.lastUsedAt(), 15 * MIN);
});

test("a quota window resetting is not use", () => {
  const tracker = createIdleTracker(0);
  tracker.observeQuota(quota(80), 5 * MIN);
  tracker.observeQuota(quota(0), 10 * MIN);
  assert.equal(tracker.lastUsedAt(), null);
});

test("an unreadable quota keeps its baseline and does not count as use", () => {
  const tracker = createIdleTracker(0);
  tracker.observeQuota(quota(10), 5 * MIN);
  tracker.observeQuota(quota(0, { readable: false, meters: {} }), 10 * MIN);
  assert.equal(tracker.lastUsedAt(), null);
  tracker.observeQuota(quota(12), 15 * MIN);
  assert.equal(tracker.lastUsedAt(), 15 * MIN);
});

test("raising the window past the current idle time rearms the alert", () => {
  const tracker = createIdleTracker(0);
  assert.equal(tracker.shouldAlert(10 * MIN, 20 * MIN), true);
  assert.equal(tracker.shouldAlert(60 * MIN, 21 * MIN), false);
  assert.equal(tracker.shouldAlert(60 * MIN, 60 * MIN), true);
});

test("provider model suffixes and casing merge into one provider", () => {
  const tracker = createIdleTracker(0);
  tracker.recordUse("claude/claude-opus-5-5", 1 * MIN);
  tracker.observeQuota([{ id: "Claude", name: "Claude", readable: true, meters: {} }], 2 * MIN);
  const providers = tracker.providers();
  assert.equal(providers.length, 1);
  assert.equal(providers[0].name, "Claude");
  assert.equal(providers[0].lastUsedAt, 1 * MIN);
});

test("providers with no use and no readable quota are left out", () => {
  const tracker = createIdleTracker(0);
  tracker.observeQuota([{ id: "codex", name: "Codex", readable: false, meters: {} }], MIN);
  assert.deepEqual(tracker.providers(), []);
});

test("quota meters read used or remaining, with spending always rising", () => {
  const meters = quotaMeters({
    windows: [
      { id: "a", usedPct: 20 },
      { id: "b", remainingPct: 70 },
      { id: "c", usedPct: null },
    ],
    balances: [
      { id: "credits", remaining: 5 },
      { id: "spend", used: 3 },
    ],
  });
  assert.deepEqual(meters, {
    "window:a": 20,
    "window:b": 30,
    "balance:credits": -5,
    "balance:spend": 3,
  });
});
