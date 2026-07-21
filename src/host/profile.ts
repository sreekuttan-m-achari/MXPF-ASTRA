import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const SUMMARY_MAX = 4 * 1024;

export type HostAnnounce = {
  purpose: string;
  os?: string;
  arch?: string;
  summary: string;
  updatedAt: string;
  hash: string;
};

export function hostMdPath(root: string = process.cwd()): string {
  return path.join(root, "HOST.md");
}

export async function hostMdExists(root?: string): Promise<boolean> {
  try {
    await access(hostMdPath(root), constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export async function readHostMarkdown(
  root?: string,
): Promise<string | undefined> {
  try {
    return await readFile(hostMdPath(root), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
}

function sectionBody(md: string, heading: string): string | undefined {
  const re = new RegExp(
    `^## ${heading}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`,
    "im",
  );
  const m = md.match(re);
  if (!m) return undefined;
  const body = m[1]!.trim();
  return body.length > 0 ? body : undefined;
}

function firstLine(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const line = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith("*("));
  return line;
}

function bulletValue(md: string, label: string): string | undefined {
  const re = new RegExp(`^-\\s+\\*\\*${label}:\\*\\*\\s*(.+)$`, "im");
  const m = md.match(re);
  return m?.[1]?.trim();
}

export function parseHostFields(md: string): {
  purpose: string;
  os?: string;
  arch?: string;
  updatedAt: string;
} {
  const purpose =
    firstLine(sectionBody(md, "Purpose")) ?? "General Linux host";
  const updatedMatch = md.match(/^Updated:\s*(.+)$/m);
  return {
    purpose,
    os: bulletValue(md, "OS"),
    arch: bulletValue(md, "Arch"),
    updatedAt: updatedMatch?.[1]?.trim() ?? new Date().toISOString(),
  };
}

export function summarizeHostMarkdown(md: string, max = SUMMARY_MAX): string {
  const trimmed = md.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 20).trimEnd()}\n\n…[truncated]`;
}

export function hashHostMarkdown(md: string): string {
  return `sha256:${createHash("sha256").update(md).digest("hex")}`;
}

export async function buildHostAnnounce(
  root?: string,
): Promise<HostAnnounce | undefined> {
  const md = await readHostMarkdown(root);
  if (!md?.trim()) return undefined;
  const fields = parseHostFields(md);
  return {
    purpose: fields.purpose,
    os: fields.os,
    arch: fields.arch,
    summary: summarizeHostMarkdown(md),
    updatedAt: fields.updatedAt,
    hash: hashHostMarkdown(md),
  };
}

export async function refreshHostMarkdown(
  root: string = process.cwd(),
  opts?: { purpose?: string; notes?: string },
): Promise<string> {
  const script = path.join(root, "deploy", "probe-host.sh");
  const args = ["--refresh", "--out", hostMdPath(root)];
  if (opts?.purpose) args.push("--purpose", opts.purpose);
  if (opts?.notes) args.push("--notes", opts.notes);

  await new Promise<void>((resolve, reject) => {
    const child = spawn("bash", [script, ...args], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", (c: Buffer) => {
      stderr += c.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`probe-host.sh exited ${code}: ${stderr.trim()}`));
    });
  });

  const md = await readHostMarkdown(root);
  if (!md) throw new Error("HOST.md missing after refresh");
  return md;
}

/** Ensure a minimal HOST.md exists (e.g. first boot without install step). */
export async function ensureMinimalHostMd(
  root: string = process.cwd(),
): Promise<void> {
  if (await hostMdExists(root)) return;
  try {
    await refreshHostMarkdown(root);
  } catch {
    const now = new Date().toISOString();
    const stub = [
      `# Host profile — ${process.env.HOSTNAME ?? "unknown"}`,
      `Updated: ${now}`,
      "",
      "## Purpose",
      "General Linux host",
      "",
      "## Notes",
      "Auto-stub — run \`bash deploy/probe-host.sh\` or install-upgrade to enrich.",
      "",
    ].join("\n");
    await writeFile(hostMdPath(root), stub, "utf8");
  }
}
