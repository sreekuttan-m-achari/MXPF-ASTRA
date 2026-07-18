# Optional Mosquitto (escape hatch)

Default hub is **HiveMQ Cloud**. Use this Compose stack only if you want a private
broker (topic ACLs, no free-tier caps, or offline lab).

```bash
docker compose -f deploy/mqtt/docker-compose.yml up -d
```

Then point AARIA/ASTRA at:

```bash
*_MQTT_PROVIDER=mosquitto
*_MQTT_URL=mqtts://YOUR_VPS:8883
```

Full Mosquitto config (users, ACLs, TLS) will land here when the optional path is needed.
