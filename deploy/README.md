# Deploy — VPS / Linux host

| Script | Purpose |
|--------|---------|
| `bash deploy/install-upgrade.sh` | Guided install / upgrade (deps, Node, `.env`, optional service) |
| `bash deploy/install-upgrade.sh --reinstall` | Wipe `node_modules`, reinstall; **keeps** `.env` + `data/` |
| `bash deploy/install-service.sh` | systemd user unit `astra-agent.service` |

## Quick VPS install

```bash
git clone git@github.com:sreekuttan-m-achari/MXPF-ASTRA.git
cd MXPF-ASTRA
bash deploy/install-upgrade.sh
```

Update later:

```bash
cd MXPF-ASTRA
bash deploy/install-upgrade.sh          # pull + npm install + keep .env
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

Never commits or deletes `.env`.
