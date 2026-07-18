export type CapContext = {
  sandboxRoot: string;
  execTimeoutMs: number;
};

export type CapResult = {
  ok: boolean;
  data?: unknown;
  error?: string;
};

export type CapHandler = (
  args: Record<string, unknown>,
  ctx: CapContext,
) => Promise<CapResult>;
