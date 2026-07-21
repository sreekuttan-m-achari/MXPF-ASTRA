import { runExec } from "./exec.js";
import { runHealth } from "./health.js";
import { runHostProfile } from "./host.js";
import { runSelfUpdate } from "./update.js";
import type { CapContext, CapHandler, CapResult } from "./types.js";

const handlers: Record<string, CapHandler> = {
  health: runHealth,
  exec: runExec,
  "host.profile": runHostProfile,
  host: runHostProfile,
  "self.update": runSelfUpdate,
  update: runSelfUpdate,
};

export type { CapContext, CapResult } from "./types.js";

export async function runCap(
  action: string,
  args: Record<string, unknown>,
  ctx: CapContext,
): Promise<CapResult> {
  const handler = handlers[action];
  if (!handler) {
    throw new Error(`unknown cap action: ${action}`);
  }
  return handler(args, ctx);
}
