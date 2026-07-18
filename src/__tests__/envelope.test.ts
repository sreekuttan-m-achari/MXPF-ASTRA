import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEnvelope, serializeEnvelope } from "../protocol/envelope.js";
import { topics } from "../protocol/topics.js";

test("round-trips envelope", () => {
  const env = {
    v: 1 as const,
    type: "cmd.exec",
    id: "job-1",
    ts: "2026-07-18T00:00:00.000Z",
    agentId: "astra-web-prod",
    payload: { action: "health", args: {} },
  };
  const again = parseEnvelope(serializeEnvelope(env));
  assert.deepEqual(again, env);
});

test("rejects wrong version", () => {
  assert.throws(() =>
    parseEnvelope(JSON.stringify({ v: 2, type: "x", id: "1", ts: "t", agentId: "a", payload: {} })),
  );
});

test("topic helpers", () => {
  assert.equal(topics.cmd("astra-web-prod"), "mxpf/v1/agents/astra-web-prod/cmd");
  assert.equal(topics.result("astra-web-prod", "job-1"), "mxpf/v1/agents/astra-web-prod/result/job-1");
});
