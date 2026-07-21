import type { CapContext, CapResult } from "./types.js";
import {
  buildHostAnnounce,
  readHostMarkdown,
  refreshHostMarkdown,
} from "../host/profile.js";

export async function runHostProfile(
  args: Record<string, unknown>,
  ctx: CapContext,
): Promise<CapResult> {
  const root = ctx.sandboxRoot;
  const refresh = args.refresh === true || args.refresh === "1";

  try {
    let markdown: string | undefined;
    if (refresh) {
      markdown = await refreshHostMarkdown(root);
    } else {
      markdown = await readHostMarkdown(root);
      if (!markdown) {
        markdown = await refreshHostMarkdown(root);
      }
    }
    const announce = await buildHostAnnounce(root);
    return {
      ok: true,
      data: {
        ok: true,
        markdown,
        purpose: announce?.purpose,
        os: announce?.os,
        arch: announce?.arch,
        updatedAt: announce?.updatedAt,
        hash: announce?.hash,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
