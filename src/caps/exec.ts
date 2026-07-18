import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import type { CapContext, CapResult } from "./types.js";

const execFileAsync = promisify(execFile);
const MAX_OUTPUT = 64 * 1024;

function truncate(text: string): string {
  return text.length > MAX_OUTPUT ? text.slice(0, MAX_OUTPUT) : text;
}

function resolveSandboxCwd(cwd: unknown, sandboxRoot: string): string {
  const root = path.resolve(sandboxRoot);
  const requested =
    typeof cwd === "string" && cwd.length > 0
      ? cwd
      : root;
  const resolved = path.isAbsolute(requested)
    ? path.resolve(requested)
    : path.resolve(root, requested);

  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`cwd escapes sandbox: ${requested}`);
  }

  return resolved;
}

export async function runExec(
  args: Record<string, unknown>,
  ctx: CapContext,
): Promise<CapResult> {
  const cmd = args.cmd;
  if (typeof cmd !== "string" || cmd.length === 0) {
    throw new Error("exec requires a non-empty cmd string");
  }

  const cwd = resolveSandboxCwd(args.cwd, ctx.sandboxRoot);
  const timeout = ctx.execTimeoutMs;
  const maxBuffer = MAX_OUTPUT;
  const useShell = args.shell !== false;

  let stdout = "";
  let stderr = "";
  let code = 0;

  try {
    if (useShell) {
      const result = await execFileAsync("/bin/bash", ["-lc", cmd], {
        cwd,
        timeout,
        maxBuffer,
      });
      stdout = truncate(String(result.stdout ?? ""));
      stderr = truncate(String(result.stderr ?? ""));
    } else {
      const argv = Array.isArray(args.argv)
        ? args.argv.filter((value): value is string => typeof value === "string")
        : [];
      const result = await execFileAsync(cmd, argv, {
        cwd,
        timeout,
        maxBuffer,
        shell: false,
      });
      stdout = truncate(String(result.stdout ?? ""));
      stderr = truncate(String(result.stderr ?? ""));
    }
  } catch (error) {
    const err = error as NodeJS.ErrnoException & {
      stdout?: string | Buffer;
      stderr?: string | Buffer;
      code?: number | null;
      signal?: NodeJS.Signals | null;
    };
    stdout = truncate(String(err.stdout ?? ""));
    stderr = truncate(String(err.stderr ?? ""));
    code = typeof err.code === "number" ? err.code : 1;
  }

  return {
    ok: true,
    data: { code, stdout, stderr },
  };
}
