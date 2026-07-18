import assert from "node:assert/strict";
import { test } from "node:test";
import { parseConfig } from "../config.js";

test("parses hive mqtt url and quoted password", () => {
  const cfg = parseConfig({
    ASTRA_MQTT_PROVIDER: "hivemq",
    ASTRA_MQTT_URL: "mqtts://example.hivemq.cloud:8883",
    ASTRA_MQTT_USERNAME: "mxpfaastra",
    ASTRA_MQTT_PASSWORD: "#secret",
    ASTRA_AGENT_ID: "astra-web-prod",
    ASTRA_AGENT_NAME: "web-prod",
  });
  assert.equal(cfg.mqtt.provider, "hivemq");
  assert.equal(cfg.mqtt.password, "#secret");
  assert.equal(cfg.agentId, "astra-web-prod");
});
