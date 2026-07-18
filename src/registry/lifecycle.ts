import { hostname } from "node:os";
import type { AstraConfig } from "../config.js";
import { runCap, type CapContext } from "../caps/index.js";
import {
  makeEnvelope,
  parseEnvelope,
  serializeEnvelope,
  type FleetEnvelope,
} from "../protocol/envelope.js";
import { topics } from "../protocol/topics.js";
import {
  saveAssignment,
  type Assignment,
} from "../state.js";
import type { FleetBus } from "../mqtt/bus.js";
import { handleCmd } from "../jobs/handler.js";

const VERSION = "0.1.0";
const DEFAULT_CAPS = ["health", "exec"];

export async function startLifecycle(
  bus: FleetBus,
  cfg: AstraConfig,
  assignment: Assignment,
): Promise<{ getAssignment: () => Assignment }> {
  let current = { ...assignment, labels: { ...assignment.labels }, caps: [...assignment.caps] };
  const capCtx: CapContext = {
    sandboxRoot: cfg.sandboxRoot,
    execTimeoutMs: cfg.execTimeoutMs,
  };

  const onCmd = async (_topic: string, payload: Buffer) => {
    let env: FleetEnvelope;
    try {
      env = parseEnvelope(payload);
    } catch (err) {
      console.error("[lifecycle] invalid cmd envelope:", err);
      return;
    }
    await handleCmd(env, {
      bus,
      agentId: cfg.agentId,
      assignment: current,
      capCtx,
      runCap,
    });
  };

  const subscribeCmd = async () => {
    await bus.subscribe(topics.cmd(cfg.agentId), onCmd, 1);
    console.error(`[lifecycle] subscribed cmd for ${cfg.agentId}`);
  };

  await bus.subscribe(
    topics.approve(cfg.agentId),
    async (_topic, payload) => {
      let env: FleetEnvelope;
      try {
        env = parseEnvelope(payload);
      } catch (err) {
        console.error("[lifecycle] invalid approve envelope:", err);
        return;
      }
      const approved = env.payload.approved === true;
      if (!approved) {
        console.error("[lifecycle] approve rejected");
        return;
      }
      const labels =
        env.payload.labels && typeof env.payload.labels === "object"
          ? (env.payload.labels as Record<string, string>)
          : {};
      const caps = Array.isArray(env.payload.caps)
        ? (env.payload.caps as string[])
        : DEFAULT_CAPS;
      current = {
        approved: true,
        labels,
        caps,
        approvedAt: new Date().toISOString(),
      };
      await saveAssignment(current);
      console.error(`[lifecycle] approved caps=${caps.join(",")}`);
      await subscribeCmd();
    },
    1,
  );

  if (current.approved) {
    await subscribeCmd();
  }

  const announcePayload: Record<string, unknown> = {
    name: cfg.agentName ?? cfg.agentId,
    labels: current.labels,
    caps: current.caps.length > 0 ? current.caps : DEFAULT_CAPS,
    hostname: hostname(),
    version: VERSION,
  };
  const token = process.env.ASTRA_REGISTRATION_TOKEN?.trim();
  if (token) announcePayload.registrationToken = token;

  const announce = makeEnvelope("registry.announce", cfg.agentId, announcePayload);
  const body = serializeEnvelope(announce);
  await bus.publish(topics.announce, body, 1);
  await bus.publish(topics.pending(cfg.agentId), body, 1);
  console.error(`[lifecycle] announced ${cfg.agentId}`);

  return {
    getAssignment: () => current,
  };
}
