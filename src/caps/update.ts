import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type { CapContext, CapResult } from "./types.js";

/**
 * Start a detached install/upgrade so the agent can restart mid-job without
 * failing the MQTT result. Returns immediately with log path.
 */
export async function runSelfUpdate(
  args: Record<string, unknown>,
  ctx: CapContext,
): Promise<CapResult> {
  const root = ctx.sandboxRoot;
  const script = path.join(root, "deploy", "install-upgrade.sh");
  if (!existsSync(script)) {
    return {
      ok: false,
      data: { error: `missing ${script}` },
    };
  }

  const flags: string[] = ["--yes"];
  if (args.reinstall === true || args.reinstall === "1") {
    flags.push("--reinstall");
  }
  if (args.refreshHost === true || args.refreshHost === "1") {
    flags.push("--refresh-host");
  }
  if (args.skipPull === true || args.skipPull === "1") {
    flags.push("--skip-pull");
  }

  const logPath = path.join("/tmp", `astra-upgrade-${Date.now()}.log`);
  const flagArgs = flags.map((f) => JSON.stringify(f)).join(" ");
  const scriptArg = JSON.stringify(script);
  const logArg = JSON.stringify(logPath);

  const child = spawn(
    "/bin/bash",
    [
      "-lc",
      `exec >>${logArg} 2>&1; echo "[astra] self.update start $(date -Is)"; bash ${scriptArg} ${flagArgs}; echo "[astra] self.update exit $?"`,
    ],
    {
      cwd: root,
      detached: true,
      stdio: "ignore",
    },
  );
  child.unref();

  return {
    ok: true,
    data: {
      started: true,
      pid: child.pid,
      logPath,
      flags,
      note: "Upgrade runs detached; agent may briefly drop offline while the service restarts.",
    },
  };
}
