import os from "node:os";
import type { CapContext, CapResult } from "./types.js";

export async function runHealth(
  _args: Record<string, unknown>,
  _ctx: CapContext,
): Promise<CapResult> {
  return {
    ok: true,
    data: {
      ok: true,
      hostname: os.hostname(),
      uptime: os.uptime(),
      load: os.loadavg(),
      freemem: os.freemem(),
      totalmem: os.totalmem(),
    },
  };
}
