import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  buildHostAnnounce,
  hashHostMarkdown,
  parseHostFields,
  summarizeHostMarkdown,
} from "../host/profile.js";

test("parseHostFields extracts purpose and os", () => {
  const md = `# Host profile — box
Updated: 2026-07-21T00:00:00Z

## Purpose
Web server

## Identity
- **OS:** Ubuntu 22.04
- **Arch:** x86_64
`;
  const f = parseHostFields(md);
  assert.equal(f.purpose, "Web server");
  assert.equal(f.os, "Ubuntu 22.04");
  assert.equal(f.arch, "x86_64");
});

test("summarizeHostMarkdown truncates", () => {
  const big = "x".repeat(5000);
  const s = summarizeHostMarkdown(big, 100);
  assert.ok(s.length <= 100);
  assert.match(s, /truncated/);
});

test("buildHostAnnounce from file", async () => {
  const dir = path.join(tmpdir(), `astra-host-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  const md = `# Host profile — t
Updated: 2026-07-21T12:00:00Z

## Purpose
Cloud VPS

## Identity
- **OS:** Debian 12
- **Arch:** x86_64
`;
  await writeFile(path.join(dir, "HOST.md"), md, "utf8");
  const host = await buildHostAnnounce(dir);
  assert.ok(host);
  assert.equal(host!.purpose, "Cloud VPS");
  assert.equal(host!.os, "Debian 12");
  assert.equal(host!.hash, hashHostMarkdown(md));
  assert.ok(host!.summary.includes("Cloud VPS"));
});
