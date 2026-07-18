import "dotenv/config";

import { loadConfig } from "./config.js";
import { createBus } from "./mqtt/bus.js";
import { startLifecycle } from "./registry/lifecycle.js";
import { loadAssignment } from "./state.js";

const cfg = loadConfig();
const bus = await createBus(cfg);
const assignment = await loadAssignment();
await startLifecycle(bus, cfg, assignment);

const shutdown = async (signal: string) => {
  console.error(`[astra] ${signal} — shutting down`);
  try {
    await bus.end();
  } finally {
    process.exit(0);
  }
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

console.error(`[astra] running as ${cfg.agentId} via ${cfg.mqtt.provider}`);
