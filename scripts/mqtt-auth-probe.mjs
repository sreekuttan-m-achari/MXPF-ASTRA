import "dotenv/config";
import mqtt from "mqtt";

const role = process.argv[2] ?? "astra";
const userKey = role === "aaria" ? "AARIA_MQTT_USERNAME" : "ASTRA_MQTT_USERNAME";
const passKey = role === "aaria" ? "AARIA_MQTT_PASSWORD" : "ASTRA_MQTT_PASSWORD";
const urlKey = role === "aaria" ? "AARIA_MQTT_URL" : "ASTRA_MQTT_URL";

const password = process.env[passKey] ?? "";
const username = process.env[userKey];
const url = process.env[urlKey];

if (!url || !username) {
  console.log(role, "missing url/username in env");
  process.exit(1);
}

console.log(role, "user", username);
console.log(role, "password_wrapped_in_quotes", /^["'].*["']$/.test(password));

try {
  const c = await mqtt.connectAsync(url, {
    username,
    password,
    protocolVersion: 5,
    connectTimeout: 10_000,
  });
  console.log(role, "auth OK");
  await c.endAsync();
} catch (err) {
  console.log(role, "auth FAIL", err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
