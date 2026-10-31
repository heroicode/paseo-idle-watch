import assert from "node:assert/strict";
import { test } from "node:test";
import { activePushTokens } from "../server/push.ts";

const NOW = Date.parse("2026-11-01T00:00:00Z");

test("keeps tokens whose lease is still running, once each", () => {
  const store = {
    subscriptions: [
      { token: "live", expiresAt: "2026-11-01T00:00:01Z" },
      { token: "live", expiresAt: "2026-11-02T00:00:00Z" },
      { token: "lapsed", expiresAt: "2026-11-01T00:00:00Z" },
    ],
  };
  assert.deepEqual(activePushTokens(store, NOW), ["live"]);
});

test("ignores malformed entries and stores", () => {
  const store = { subscriptions: [null, { token: "no-expiry" }, { expiresAt: "2027-01-01T00:00:00Z" }] };
  assert.deepEqual(activePushTokens(store, NOW), []);
  assert.deepEqual(activePushTokens({}, NOW), []);
  assert.deepEqual(activePushTokens(null, NOW), []);
});
