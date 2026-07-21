import assert from "node:assert/strict";
import { test } from "node:test";

import { capAllowed } from "../jobs/handler.js";

test("capAllowed update aliases", () => {
  assert.equal(capAllowed("self.update", ["update"]), true);
  assert.equal(capAllowed("update", ["update"]), true);
  assert.equal(capAllowed("self.update", ["health", "exec"]), false);
  assert.equal(capAllowed("host.profile", ["host"]), true);
});
