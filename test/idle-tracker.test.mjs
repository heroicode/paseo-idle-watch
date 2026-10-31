import assert from "node:assert/strict";
import { test } from "node:test";
import { createIdleTracker, quotaMeters } from "../server/idle-tracker.ts";
import { isWatched } from "../shared/contracts.ts";

const MIN = 60_000;
const policy = (idleMs, repeatMs = 0, overrides = {}) => ({
  idleMs,
  repeatMs,
  isWatched: (id, hasQuota) => isWatched(overrides, id, hasQuota),
});
const quota = (id, pct, extra = {}) => ({
  id,
  name: id,
  readable: true,
  meters: { "window:5h": pct },
  ...extra,
});
const noQuota = (id) => ({ id, name: id, readable: true, meters: {} });
const dueIds = (tracker, ...args) => tracker.dueAlerts(...args).map((use) => use.id);

test("one provider going idle alerts even while another is busy", () => {
  const tracker = createIdleTracker();
  tracker.observeQuota([quota("claude", 1), quota("codex", 1)], 0);
  tracker.recordUse("claude", 25 * MIN);
  assert.deepEqual(dueIds(tracker, policy(30 * MIN), 30 * MIN), ["codex"]);
  assert.deepEqual(dueIds(tracker, policy(30 * MIN), 31 * MIN), []);
});

test("providers idle at the same check share one alert, and each alerts once a stretch", () => {
  const tracker = createIdleTracker();
  tracker.observeQuota([quota("claude", 1), quota("codex", 1)], 0);
  assert.deepEqual(dueIds(tracker, policy(10 * MIN), 10 * MIN), ["claude", "codex"]);
  assert.deepEqual(dueIds(tracker, policy(10 * MIN), 500 * MIN), []);
  tracker.recordUse("claude", 501 * MIN);
  assert.deepEqual(dueIds(tracker, policy(10 * MIN), 502 * MIN), []);
  assert.deepEqual(dueIds(tracker, policy(10 * MIN), 511 * MIN), ["claude"]);
});

test("a provider's clock starts when it is first seen, not at its old activity", () => {
  const tracker = createIdleTracker();
  tracker.observeAgents([{ provider: "claude", activeAt: 1 * MIN }], 100 * MIN);
  assert.deepEqual(dueIds(tracker, policy(30 * MIN), 129 * MIN), []);
  assert.deepEqual(dueIds(tracker, policy(30 * MIN), 130 * MIN), ["claude"]);
});

test("nothing alerts before any provider is known, however long it has been", () => {
  const tracker = createIdleTracker();
  assert.deepEqual(dueIds(tracker, policy(10 * MIN), 500 * MIN), []);
  tracker.observeQuota([quota("claude", 1)], 501 * MIN);
  assert.deepEqual(dueIds(tracker, policy(10 * MIN), 510 * MIN), []);
  assert.deepEqual(dueIds(tracker, policy(10 * MIN), 511 * MIN), ["claude"]);
});

test("providers with no quota are off by default, and a switch overrides either way", () => {
  const tracker = createIdleTracker();
  tracker.observeQuota([quota("claude", 1), noQuota("copilot")], 0);
  assert.deepEqual(dueIds(tracker, policy(10 * MIN), 10 * MIN), ["claude"]);

  const switched = createIdleTracker();
  switched.observeQuota([quota("claude", 1), noQuota("copilot")], 0);
  const overrides = { copilot: true, claude: false };
  assert.deepEqual(dueIds(switched, policy(10 * MIN, 0, overrides), 10 * MIN), ["copilot"]);
});

test("a provider only seen through agents is watched until a quota read says it has none", () => {
  const tracker = createIdleTracker();
  tracker.recordUse("pi", 0);
  assert.deepEqual(dueIds(tracker, policy(10 * MIN), 10 * MIN), ["pi"]);
  tracker.observeQuota([quota("claude", 1)], 11 * MIN);
  assert.equal(tracker.providers(policy(10 * MIN), 12 * MIN).find((use) => use.id === "pi").hasQuota, false);
  assert.deepEqual(dueIds(tracker, policy(10 * MIN), 30 * MIN), ["claude"]);
});

test("an unreadable quota stays watched and keeps what was known", () => {
  const tracker = createIdleTracker();
  tracker.observeQuota([quota("codex", 0, { readable: false, meters: {} }), noQuota("copilot")], 0);
  tracker.observeQuota([quota("copilot", 0, { readable: false, meters: {} })], MIN);
  const seen = tracker.providers(policy(10 * MIN), 2 * MIN);
  assert.equal(seen.find((use) => use.id === "codex").hasQuota, true);
  assert.equal(seen.find((use) => use.id === "copilot").hasQuota, false);
});

test("turning a provider on while it is idle alerts right away", () => {
  const tracker = createIdleTracker();
  tracker.observeQuota([noQuota("copilot")], 0);
  assert.deepEqual(dueIds(tracker, policy(10 * MIN), 20 * MIN), []);
  assert.deepEqual(dueIds(tracker, policy(10 * MIN, 0, { copilot: true }), 21 * MIN), ["copilot"]);
});

test("repeats per provider while idle, and stops when that provider is used", () => {
  const tracker = createIdleTracker();
  tracker.observeQuota([quota("claude", 1)], 0);
  const repeating = policy(10 * MIN, 5 * MIN);
  assert.deepEqual(dueIds(tracker, repeating, 10 * MIN), ["claude"]);
  assert.deepEqual(dueIds(tracker, repeating, 14 * MIN), []);
  assert.deepEqual(dueIds(tracker, repeating, 15 * MIN), ["claude"]);
  tracker.recordUse("claude", 17 * MIN);
  assert.deepEqual(dueIds(tracker, repeating, 22 * MIN), []);
  assert.deepEqual(dueIds(tracker, repeating, 27 * MIN), ["claude"]);
});

test("a check arriving a moment early still counts as the repeat", () => {
  const tracker = createIdleTracker();
  tracker.observeQuota([quota("claude", 1)], 0);
  assert.deepEqual(dueIds(tracker, policy(MIN, MIN), 60_000), ["claude"]);
  assert.deepEqual(dueIds(tracker, policy(MIN, MIN), 119_900), ["claude"]);
});

test("a rising quota meter counts as use for that provider only", () => {
  const tracker = createIdleTracker();
  tracker.observeQuota([quota("claude", 10), quota("codex", 10)], 5 * MIN);
  assert.equal(tracker.lastUsedAt(), null);
  tracker.observeQuota([quota("claude", 11), quota("codex", 10)], 15 * MIN);
  const seen = tracker.providers(policy(MIN), 15 * MIN);
  assert.equal(seen.find((use) => use.id === "claude").lastUsedAt, 15 * MIN);
  assert.equal(seen.find((use) => use.id === "codex").lastUsedAt, null);
});

test("a quota window resetting is not use", () => {
  const tracker = createIdleTracker();
  tracker.observeQuota([quota("claude", 80)], 5 * MIN);
  tracker.observeQuota([quota("claude", 0)], 10 * MIN);
  assert.equal(tracker.lastUsedAt(), null);
});

test("an unreadable reading keeps the quota baseline", () => {
  const tracker = createIdleTracker();
  tracker.observeQuota([quota("claude", 10)], 5 * MIN);
  tracker.observeQuota([quota("claude", 0, { readable: false, meters: {} })], 10 * MIN);
  assert.equal(tracker.lastUsedAt(), null);
  tracker.observeQuota([quota("claude", 12)], 15 * MIN);
  assert.equal(tracker.lastUsedAt(), 15 * MIN);
});

test("raising the window past the current idle time rearms the alert", () => {
  const tracker = createIdleTracker();
  tracker.observeQuota([quota("claude", 1)], 0);
  assert.deepEqual(dueIds(tracker, policy(10 * MIN), 20 * MIN), ["claude"]);
  assert.deepEqual(dueIds(tracker, policy(60 * MIN), 21 * MIN), []);
  assert.deepEqual(dueIds(tracker, policy(60 * MIN), 60 * MIN), ["claude"]);
});

test("provider model suffixes and casing merge into one provider", () => {
  const tracker = createIdleTracker();
  tracker.recordUse("claude/claude-opus-5-5", 1 * MIN);
  tracker.observeQuota([{ id: "Claude", name: "Claude", readable: true, meters: {} }], 2 * MIN);
  const providers = tracker.providers(policy(MIN), 2 * MIN);
  assert.equal(providers.length, 1);
  assert.equal(providers[0].name, "Claude");
  assert.equal(providers[0].lastUsedAt, 1 * MIN);
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
