import assert from "node:assert/strict";
import { test } from "node:test";
import { runCap } from "../caps/index.js";
import type { CapContext } from "../caps/types.js";

const ctx: CapContext = {
  sandboxRoot: "/tmp/astra-sandbox-test",
  execTimeoutMs: 5_000,
};

test("exec rejects path escape", async () => {
  await assert.rejects(() =>
    runCap("exec", { cmd: "pwd", cwd: "/tmp/../etc" }, ctx),
  );
});

test("health returns hostname", async () => {
  const r = await runCap("health", {}, ctx);
  assert.equal(r.ok, true);
  assert.ok((r.data as { hostname: string }).hostname);
});
