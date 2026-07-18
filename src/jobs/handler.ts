import type { CapContext, CapResult } from "../caps/types.js";
import {
  makeEnvelope,
  serializeEnvelope,
  type FleetEnvelope,
} from "../protocol/envelope.js";
import { topics } from "../protocol/topics.js";
import type { Assignment } from "../state.js";
import type { FleetBus } from "../mqtt/bus.js";

export type HandleCmdDeps = {
  bus: FleetBus;
  agentId: string;
  assignment: Assignment;
  capCtx: CapContext;
  runCap: (
    action: string,
    args: Record<string, unknown>,
    ctx: CapContext,
  ) => Promise<CapResult>;
};

export async function handleCmd(
  env: FleetEnvelope,
  deps: HandleCmdDeps,
): Promise<void> {
  if (env.type !== "cmd.exec") return;
  if (!deps.assignment.approved) {
    console.error("[jobs] ignoring cmd — not approved");
    return;
  }
  if (env.agentId !== deps.agentId) {
    console.error("[jobs] ignoring cmd — agentId mismatch");
    return;
  }

  const action =
    typeof env.payload.action === "string" ? env.payload.action : "";
  if (!action) {
    await publishResult(deps, env.id, {
      ok: false,
      action: "",
      error: "missing action",
    });
    return;
  }

  const allowed = deps.assignment.caps;
  if (allowed.length > 0 && !allowed.includes(action)) {
    await publishResult(deps, env.id, {
      ok: false,
      action,
      error: `cap not allowed: ${action}`,
    });
    return;
  }

  const args =
    env.payload.args && typeof env.payload.args === "object"
      ? (env.payload.args as Record<string, unknown>)
      : {};

  const cmdPreview =
    action === "exec" && typeof args.cmd === "string"
      ? String(args.cmd).slice(0, 120)
      : "";
  console.error(
    `[jobs] recv ${action} job=${env.id}${cmdPreview ? ` cmd=${JSON.stringify(cmdPreview)}` : ""}`,
  );

  try {
    const result = await deps.runCap(action, args, deps.capCtx);
    const ok = isJobOk(action, result);
    await publishResult(deps, env.id, {
      ok,
      action,
      data: result.data,
      error: result.error,
    });
    if (action === "exec") {
      const data = result.data as { code?: number; stdout?: string } | undefined;
      const out = (data?.stdout ?? "").trim().split("\n")[0] ?? "";
      console.error(
        `[jobs] done ${action} job=${env.id} ok=${ok} code=${data?.code ?? "?"}${out ? ` out=${JSON.stringify(out.slice(0, 100))}` : ""}`,
      );
    } else {
      console.error(`[jobs] done ${action} job=${env.id} ok=${ok}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[jobs] fail ${action} job=${env.id}: ${message}`);
    await publishResult(deps, env.id, {
      ok: false,
      action,
      error: message,
    });
  }
}

function isJobOk(action: string, result: CapResult): boolean {
  if (!result.ok) return false;
  if (action === "exec") {
    const data = result.data as { code?: unknown } | undefined;
    if (data && typeof data.code === "number" && data.code !== 0) {
      return false;
    }
  }
  return true;
}

async function publishResult(
  deps: HandleCmdDeps,
  jobId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const env = makeEnvelope("cmd.result", deps.agentId, payload, jobId);
  await deps.bus.publish(
    topics.result(deps.agentId, jobId),
    serializeEnvelope(env),
    1,
  );
}
