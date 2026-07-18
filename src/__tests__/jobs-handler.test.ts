import assert from "node:assert/strict";
import { test } from "node:test";
import { handleCmd } from "../jobs/handler.js";
import { makeEnvelope } from "../protocol/envelope.js";
import { topics } from "../protocol/topics.js";
import type { FleetBus } from "../mqtt/bus.js";
import type { Assignment } from "../state.js";
import type { CapContext, CapResult } from "../caps/types.js";

function fakeBus() {
  const published: { topic: string; payload: string; qos: number }[] = [];
  const bus: FleetBus = {
    publish: async (topic, payload, qos = 1) => {
      published.push({ topic, payload, qos });
    },
    subscribe: async () => {},
    end: async () => {},
  };
  return { bus, published };
}

test("handleCmd ignores non-cmd.exec", async () => {
  const { bus, published } = fakeBus();
  const env = makeEnvelope("chat.message", "astra-demo", { text: "hi" });
  await handleCmd(env, {
    bus,
    agentId: "astra-demo",
    assignment: { approved: true, labels: {}, caps: ["health", "exec"] },
    capCtx: { sandboxRoot: process.cwd(), execTimeoutMs: 5000 },
    runCap: async () => ({ ok: true, data: {} }),
  });
  assert.equal(published.length, 0);
});

test("handleCmd ignores when not approved", async () => {
  const { bus, published } = fakeBus();
  const env = makeEnvelope("cmd.exec", "astra-demo", {
    action: "health",
    args: {},
  });
  await handleCmd(env, {
    bus,
    agentId: "astra-demo",
    assignment: { approved: false, labels: {}, caps: [] },
    capCtx: { sandboxRoot: process.cwd(), execTimeoutMs: 5000 },
    runCap: async () => ({ ok: true, data: {} }),
  });
  assert.equal(published.length, 0);
});

test("handleCmd publishes result for health", async () => {
  const { bus, published } = fakeBus();
  const env = makeEnvelope(
    "cmd.exec",
    "astra-demo",
    { action: "health", args: {} },
    "job-health-1",
  );
  await handleCmd(env, {
    bus,
    agentId: "astra-demo",
    assignment: {
      approved: true,
      labels: {},
      caps: ["health", "exec"],
    } satisfies Assignment,
    capCtx: { sandboxRoot: process.cwd(), execTimeoutMs: 5000 } satisfies CapContext,
    runCap: async (): Promise<CapResult> => ({
      ok: true,
      data: { ok: true, hostname: "test-host" },
    }),
  });
  assert.equal(published.length, 1);
  assert.equal(published[0]!.topic, topics.result("astra-demo", "job-health-1"));
  assert.equal(published[0]!.qos, 1);
  const body = JSON.parse(published[0]!.payload);
  assert.equal(body.type, "cmd.result");
  assert.equal(body.payload.ok, true);
  assert.equal(body.payload.action, "health");
});

test("handleCmd marks exec non-zero code as failure", async () => {
  const { bus, published } = fakeBus();
  const env = makeEnvelope(
    "cmd.exec",
    "astra-demo",
    { action: "exec", args: { cmd: "false" } },
    "job-exec-1",
  );
  await handleCmd(env, {
    bus,
    agentId: "astra-demo",
    assignment: { approved: true, labels: {}, caps: ["health", "exec"] },
    capCtx: { sandboxRoot: process.cwd(), execTimeoutMs: 5000 },
    runCap: async () => ({
      ok: true,
      data: { code: 1, stdout: "", stderr: "failed" },
    }),
  });
  const body = JSON.parse(published[0]!.payload);
  assert.equal(body.payload.ok, false);
  assert.equal(body.payload.data.code, 1);
});
