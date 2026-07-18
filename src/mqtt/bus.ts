import mqtt, { type MqttClient } from "mqtt";
import type { AstraConfig } from "../config.js";

export type FleetBus = {
  publish: (topic: string, payload: string, qos?: 0 | 1 | 2) => Promise<void>;
  subscribe: (
    topic: string,
    handler: (topic: string, payload: Buffer) => void | Promise<void>,
    qos?: 0 | 1 | 2,
  ) => Promise<void>;
  end: () => Promise<void>;
};

export async function createBus(cfg: AstraConfig): Promise<FleetBus> {
  const client: MqttClient = await mqtt.connectAsync(cfg.mqtt.url, {
    username: cfg.mqtt.username,
    password: cfg.mqtt.password,
    protocolVersion: 5,
    reconnectPeriod: 2000,
    clean: true,
  });

  const handlers = new Map<
    string,
    Set<(topic: string, payload: Buffer) => void | Promise<void>>
  >();

  client.on("message", (topic, payload) => {
    for (const [pattern, set] of handlers) {
      if (!topicMatches(pattern, topic)) continue;
      for (const handler of set) {
        void Promise.resolve(handler(topic, payload)).catch((err) => {
          console.error(`[mqtt] handler error on ${topic}:`, err);
        });
      }
    }
  });

  return {
    async publish(topic, payload, qos = 1) {
      await client.publishAsync(topic, payload, { qos });
    },
    async subscribe(topic, handler, qos = 1) {
      let set = handlers.get(topic);
      if (!set) {
        set = new Set();
        handlers.set(topic, set);
        await client.subscribeAsync(topic, { qos });
      }
      set.add(handler);
    },
    async end() {
      await client.endAsync();
    },
  };
}

function topicMatches(pattern: string, topic: string): boolean {
  const pp = pattern.split("/");
  const tt = topic.split("/");
  for (let i = 0; i < pp.length; i++) {
    const p = pp[i]!;
    if (p === "#") return true;
    if (p === "+") {
      if (i >= tt.length) return false;
      continue;
    }
    if (i >= tt.length || p !== tt[i]) return false;
  }
  return pp.length === tt.length;
}
