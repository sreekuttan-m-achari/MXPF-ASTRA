# A.S.T.R.A. — Autonomous Site Task & Response Agent

> AARIA’s remote **minions**. Persistent site agents for VPS, Kubernetes, and other
> online hosts — register over MQTT, run allowlisted work, report status and events.

**Formal designation:** **A.S.T.R.A.** — **Autonomous Site Task & Response Agent**  
**Short form:** ASTRA

Inspired by CI runners (GitHub Actions, GitLab Runner, Azure DevOps agents): the agent
lives on the asset, dials **out** to a hub, and receives work. AARIA’s laptop does not
need a stable public IP.

```
┌─────────────────────┐         ┌──────────────────────────┐         ┌─────────────────────┐
│  AARIA (desk)       │         │  MQTT Hub (always-on)    │         │  ASTRA minion(s)    │
│  commander + brain  │◄───────►│  HiveMQ (default)        │◄───────►│  VPS / K8s / host   │
│  MXPF-AARIA-API     │         │  Mosquitto (optional)    │         │  MXPF-ASTRA-AGENT   │
└─────────────────────┘         └──────────────────────────┘         └─────────────────────┘
```

## Status

**Slice A (executor) implemented** — MQTT announce/approve/`cmd.exec` over HiveMQ.
Design: [`docs/superpowers/specs/2026-07-18-astra-design.md`](docs/superpowers/specs/2026-07-18-astra-design.md).
Plan: [`docs/superpowers/plans/2026-07-18-astra-slice-a.md`](docs/superpowers/plans/2026-07-18-astra-slice-a.md).

## Run

Requires **Node.js ≥ 22.13** (see `.nvmrc`).

### VPS / host install (recommended)

```bash
git clone git@github.com:sreekuttan-m-achari/MXPF-ASTRA.git
cd MXPF-ASTRA
bash deploy/install-upgrade.sh        # deps, Node via nvm, .env, optional systemd
# later:
bash deploy/install-upgrade.sh        # upgrade (pull + npm install)
bash deploy/install-upgrade.sh -r     # reinstall deps; keeps .env
```

See [`deploy/README.md`](deploy/README.md).

### Manual

1. Create a HiveMQ user for this minion (Access Management → **Publish and Subscribe**), e.g. `mxpfastra`.
2. Configure `.env` from `.env.sample` (quote passwords that start with `#`).
3. Set `ASTRA_AGENT_ID` (e.g. `astra-demo`).

```bash
cp .env.sample .env              # configure MQTT credentials (gitignored)
nvm install && nvm use           # Node 22
npm install

npm start                        # announce + wait for AARIA approve + run jobs
npm run dev                      # watch mode during development
npm test                         # unit tests (tsx --test)
```

### Slice A smoke (with AARIA)

With AARIA running and fleet connected (`GET /fleet/health`):

```bash
# After this agent has announced:
curl -s http://127.0.0.1:8788/fleet/agents
curl -s -X POST http://127.0.0.1:8788/fleet/approve \
  -H 'content-type: application/json' \
  -d '{"agentId":"astra-demo","labels":{"env":"lab"},"caps":["health","exec"]}'
curl -s -X POST http://127.0.0.1:8788/fleet/cmd \
  -H 'content-type: application/json' \
  -d '{"agentId":"astra-demo","action":"health"}'
```

If `npm start` fails with `Not authorized`, the HiveMQ username/password for this minion is wrong or missing.

## What ASTRA does

| Mode | Behaviour |
|------|-----------|
| **Executor (default)** | MQTT + capability packs only — light, no Cursor secrets on the box |
| **Watchdog** | Heartbeats, health checks, proactive events to AARIA |
| **Local brain (opt-in)** | Cursor SDK on the minion — **single-tenant hosts only** (`ASTRA_BRAIN=1`) |

**Default intelligence path:** natural language stays with **AARIA** on the desk; she
emits structured `cmd.exec` actions to the minion. That keeps `CURSOR_API_KEY` off
shared / multi-user VPS hosts.

## Hub (HiveMQ default)

Point at HiveMQ Cloud (TLS MQTT). Self-hosted Mosquitto Compose under `deploy/mqtt/` is
**optional** only — not required for day-1.

```bash
ASTRA_MQTT_PROVIDER=hivemq
ASTRA_MQTT_URL=mqtts://<cluster>.s1.eu.hivemq.cloud:8883
ASTRA_MQTT_USERNAME=astra-<name>
ASTRA_MQTT_PASSWORD=...
```

Copy `.env.sample` → `.env` (gitignored). Never commit credentials.

## Protocol (summary)

Prefix `mxpf/v1` — registry announce/approve, per-agent `cmd` / `status` / `result` /
`reply` / `event`. Payloads are either structured `cmd.exec` or `chat.message` (routed
per brain mode). See the design spec for the full topic map.

## Assignment

Each minion has:

- **Labels** — role, env, tags (routing)
- **Persona pack** — `SOUL.md`, `OBJECTIVES.md`, `ENV.md` (thin; for local brain / identity)
- **Capability packs** — core allowlist + optional `docker` / `nginx` / `k8s`

## Build slices

1. **A** — register, approve, execute allowlisted commands  
2. **B** — monitoring + proactive notifications  
3. **C** — optional local Cursor brain  

## Related

- **AARIA** (`MXPF-AARIA-API`) — commander; fleet awareness in `SOUL.md`, `FLEET.md`, `skills/astra-fleet`
- **SSH-Connect** — interactive SSH/console MCP from the desk (complement, not a substitute)
- **Amelia** — home lane; not part of the fleet path
