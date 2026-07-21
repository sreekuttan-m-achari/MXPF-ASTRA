# Deploy — VPS / Linux host

| Script | Purpose |
|--------|---------|
| `bash deploy/install-upgrade.sh` | Guided install / upgrade (deps, Node, `.env`, optional service) |
| `bash deploy/install-upgrade.sh --reinstall` | Wipe `node_modules`, reinstall; **keeps** `.env` + `data/` + `HOST.md` |
| `bash deploy/probe-host.sh` | Probe OS/runtimes/services → write `HOST.md` |
| `bash deploy/install-service.sh` | systemd user unit `astra-agent.service` |

## Quick VPS install

```bash
git clone git@github.com:sreekuttan-m-achari/MXPF-ASTRA.git
cd MXPF-ASTRA
bash deploy/install-upgrade.sh
```

The installer prompts for **host purpose** (auto-guessed from nginx/apache/desktop/etc.) and writes `HOST.md`. That profile is announced to AARIA as a compact summary; full file is available via fleet action `host.profile`.

Update later:

```bash
cd MXPF-ASTRA
bash deploy/install-upgrade.sh          # pull + npm install + keep .env / HOST.md
bash deploy/install-upgrade.sh --refresh-host
# or
bash deploy/install-upgrade.sh --reinstall
```

## Service

```bash
bash deploy/install-service.sh
systemctl --user status astra-agent.service
journalctl --user -u astra-agent.service -f

# survive SSH logout
loginctl enable-linger "$(whoami)"
```

## Flags

| Flag | Meaning |
|------|---------|
| `--reinstall` / `-r` | Remove `node_modules`, reinstall deps |
| `--yes` / `-y` | Prefer defaults (still prompts for missing secrets) |
| `--skip-service` | Do not offer systemd install |
| `--skip-pull` | Do not `git pull` |
| `--refresh-host` | Re-probe and rewrite `HOST.md` |

Never commits or deletes `.env` / `HOST.md` / `data/`.
