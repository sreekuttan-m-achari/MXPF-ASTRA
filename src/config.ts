import { config as loadDotenv } from "dotenv";
import { z } from "zod";

const EnvSchema = z.object({
  ASTRA_MQTT_PROVIDER: z.string().min(1).default("hivemq"),
  ASTRA_MQTT_URL: z.string().min(1),
  ASTRA_MQTT_WS_URL: z.string().min(1).optional(),
  ASTRA_MQTT_USERNAME: z.string().min(1),
  ASTRA_MQTT_PASSWORD: z.string().min(1),
  ASTRA_AGENT_ID: z.string().min(1),
  ASTRA_AGENT_NAME: z.string().min(1).optional(),
  ASTRA_SANDBOX_ROOT: z.string().min(1).optional(),
  ASTRA_EXEC_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
});

export type AstraConfig = {
  mqtt: {
    provider: string;
    url: string;
    wsUrl?: string;
    username: string;
    password: string;
  };
  agentId: string;
  agentName?: string;
  sandboxRoot: string;
  execTimeoutMs: number;
};

function toConfig(env: z.infer<typeof EnvSchema>): AstraConfig {
  return {
    mqtt: {
      provider: env.ASTRA_MQTT_PROVIDER,
      url: env.ASTRA_MQTT_URL,
      wsUrl: env.ASTRA_MQTT_WS_URL,
      username: env.ASTRA_MQTT_USERNAME,
      password: env.ASTRA_MQTT_PASSWORD,
    },
    agentId: env.ASTRA_AGENT_ID,
    agentName: env.ASTRA_AGENT_NAME,
    sandboxRoot: env.ASTRA_SANDBOX_ROOT ?? process.cwd(),
    execTimeoutMs: env.ASTRA_EXEC_TIMEOUT_MS ?? 30_000,
  };
}

export function parseConfig(source: Record<string, string | undefined>): AstraConfig {
  return toConfig(EnvSchema.parse(source));
}

export function loadConfig(): AstraConfig {
  loadDotenv();
  return parseConfig(process.env);
}
