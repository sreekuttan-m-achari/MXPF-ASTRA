#!/usr/bin/env bash
# Guided install / upgrade / reinstall for ASTRA (VPS / Linux host).
#
# Usage:
#   bash deploy/install-upgrade.sh              # install or upgrade (prompts)
#   bash deploy/install-upgrade.sh --reinstall  # wipe node_modules; keep .env
#   bash deploy/install-upgrade.sh --yes        # non-interactive defaults where possible
#   bash deploy/install-upgrade.sh --help
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FORCE_REINSTALL=0
ASSUME_YES=0
SKIP_SERVICE=0
SKIP_PULL=0

for arg in "$@"; do
  case "$arg" in
    --reinstall|-r) FORCE_REINSTALL=1 ;;
    --yes|-y) ASSUME_YES=1 ;;
    --skip-service) SKIP_SERVICE=1 ;;
    --skip-pull) SKIP_PULL=1 ;;
    --help|-h)
      cat <<'EOF'
ASTRA guided install / upgrade / reinstall (VPS-friendly)

  bash deploy/install-upgrade.sh
  bash deploy/install-upgrade.sh --reinstall   Clean deps; keep .env / data /
  bash deploy/install-upgrade.sh --yes         Prefer defaults / skip confirmations
  bash deploy/install-upgrade.sh --skip-service
  bash deploy/install-upgrade.sh --skip-pull

Never deletes: .env  data/  SOUL.md  OBJECTIVES.md  ENV.md
EOF
      exit 0
      ;;
    *)
      printf 'Unknown option: %s (try --help)\n' "$arg" >&2
      exit 2
      ;;
  esac
done

# ── UI ────────────────────────────────────────────────────────────────────────

if [[ -t 1 ]]; then
  BOLD=$'\033[1m'
  DIM=$'\033[2m'
  GREEN=$'\033[32m'
  YELLOW=$'\033[33m'
  RED=$'\033[31m'
  CYAN=$'\033[36m'
  RESET=$'\033[0m'
else
  BOLD="" DIM="" GREEN="" YELLOW="" RED="" CYAN="" RESET=""
fi

info()  { printf '%s\n' "${CYAN}→${RESET} $*"; }
ok()    { printf '%s\n' "${GREEN}✓${RESET} $*"; }
warn()  { printf '%s\n' "${YELLOW}!${RESET} $*"; }
fail()  { printf '%s\n' "${RED}✗${RESET} $*" >&2; }
step()  { printf '\n%s%s%s\n' "${BOLD}" "$*" "${RESET}"; }
hr()    { printf '%s\n' "${DIM}────────────────────────────────────────────────${RESET}"; }

to_lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

prompt_yn() {
  local question="$1"
  local default="${2:-y}"
  local hint reply
  if [[ "$ASSUME_YES" -eq 1 ]]; then
    [[ "$default" == "y" ]] && return 0 || return 1
  fi
  if [[ "$default" == "y" ]]; then hint="Y/n"; else hint="y/N"; fi
  while true; do
    printf '%s [%s] ' "$question" "$hint" >/dev/tty
    read -r reply </dev/tty || reply=""
    reply="${reply:-$default}"
    case "$(to_lower "$reply")" in
      y|yes) return 0 ;;
      n|no)  return 1 ;;
      *) warn "Please answer y or n." ;;
    esac
  done
}

prompt_value() {
  local question="$1"
  local default="${2:-}"
  local secret="${3:-0}"
  local reply
  if [[ "$ASSUME_YES" -eq 1 && -n "$default" ]]; then
    printf '%s' "$default"
    return
  fi
  if [[ -n "$default" ]]; then
    printf '%s [%s]: ' "$question" "$default" >/dev/tty
  else
    printf '%s: ' "$question" >/dev/tty
  fi
  if [[ "$secret" == "1" ]]; then
    read -rs reply </dev/tty || reply=""
    printf '\n' >/dev/tty
  else
    read -r reply </dev/tty || reply=""
  fi
  if [[ -z "$reply" ]]; then
    printf '%s' "$default"
  else
    printf '%s' "$reply"
  fi
}

# ── Env file helpers ──────────────────────────────────────────────────────────

quote_env_value() {
  local v="$1"
  # Quote when # / spaces / shell-ish chars would break dotenv
  if [[ "$v" == \#* || "$v" == *[\"\'\\\$\`\ \#]* ]]; then
    v="${v//\\/\\\\}"
    v="${v//\"/\\\"}"
    printf '"%s"' "$v"
  else
    printf '%s' "$v"
  fi
}

env_get() {
  local key="$1" file="${2:-$ROOT/.env}"
  [[ -f "$file" ]] || return 0
  # shellcheck disable=SC2002
  local line
  line="$(grep -E "^${key}=" "$file" 2>/dev/null | tail -n1 || true)"
  [[ -n "$line" ]] || return 0
  local val="${line#*=}"
  # strip surrounding quotes
  if [[ "$val" == \"*\" ]]; then
    val="${val:1:${#val}-2}"
  elif [[ "$val" == \'*\' ]]; then
    val="${val:1:${#val}-2}"
  fi
  printf '%s' "$val"
}

env_set() {
  local key="$1" value="$2" file="${3:-$ROOT/.env}"
  local q
  q="$(quote_env_value "$value")"
  touch "$file"
  if grep -qE "^${key}=" "$file" 2>/dev/null; then
    # Use awk to avoid sed issues with special chars
    local tmp
    tmp="$(mktemp)"
    awk -v k="$key" -v v="$q" '
      BEGIN { done=0 }
      $0 ~ ("^" k "=") { print k "=" v; done=1; next }
      { print }
      END { if (!done) print k "=" v }
    ' "$file" >"$tmp"
    mv "$tmp" "$file"
  else
    printf '%s=%s\n' "$key" "$q" >>"$file"
  fi
}

# ── Detection ─────────────────────────────────────────────────────────────────

MODE="install"
if [[ -f "$ROOT/.env" ]] || [[ -d "$ROOT/node_modules" ]]; then
  MODE="upgrade"
fi
if [[ "$FORCE_REINSTALL" -eq 1 ]]; then
  MODE="reinstall"
fi

hr
printf '%sA.S.T.R.A.%s — Autonomous Site Task & Response Agent\n' "$BOLD" "$RESET"
printf '%sMode:%s %s\n' "$DIM" "$RESET" "$MODE"
printf '%sRoot:%s %s\n' "$DIM" "$RESET" "$ROOT"
hr

# ── Step 1: OS / tools ────────────────────────────────────────────────────────

step "1) Host prerequisites"

OS="$(uname -s)"
case "$OS" in
  Linux*) ok "OS: Linux" ;;
  Darwin*) ok "OS: macOS (systemd service install will be skipped)" ;;
  *) warn "OS: $OS — service install may not be available" ;;
esac

need_cmd() {
  local c="$1"
  if command -v "$c" >/dev/null 2>&1; then
    ok "$c: $(command -v "$c")"
    return 0
  fi
  fail "$c not found"
  return 1
}

MISSING=0
need_cmd git || MISSING=1
need_cmd curl || MISSING=1
if [[ "$MISSING" -eq 1 ]]; then
  fail "Install missing tools (git, curl) and re-run."
  exit 1
fi

# ── Step 2: Node.js ≥ 22.13 ───────────────────────────────────────────────────

step "2) Node.js (≥ 22.13)"

ensure_nvm() {
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    # shellcheck source=/dev/null
    . "$NVM_DIR/nvm.sh"
    return 0
  fi
  return 1
}

install_nvm() {
  info "Installing nvm…"
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
}

node_ok() {
  local ver major minor
  ver="$(node -v 2>/dev/null || true)"
  [[ "$ver" =~ ^v([0-9]+)\.([0-9]+) ]] || return 1
  major="${BASH_REMATCH[1]}"
  minor="${BASH_REMATCH[2]}"
  if [[ "$major" -gt 22 ]]; then return 0; fi
  if [[ "$major" -eq 22 && "$minor" -ge 13 ]]; then return 0; fi
  return 1
}

if ensure_nvm; then
  ok "nvm available"
elif prompt_yn "nvm not found. Install nvm now?" y; then
  install_nvm
  ok "nvm installed"
else
  warn "Continuing without nvm — system Node must be ≥ 22.13"
fi

if ensure_nvm; then
  info "Installing/using Node from .nvmrc…"
  nvm install
  nvm use
fi

if ! command -v node >/dev/null 2>&1; then
  fail "node not found. Install Node 22.13+ (nvm recommended) and re-run."
  exit 1
fi

NODE_VER="$(node -v)"
if node_ok; then
  ok "Node $NODE_VER"
else
  fail "Need Node ≥ 22.13 (got $NODE_VER). Run: nvm install && nvm use"
  exit 1
fi

need_cmd npm || { fail "npm missing"; exit 1; }

# ── Step 3: Git update (optional) ─────────────────────────────────────────────

step "3) Source update"

if [[ "$SKIP_PULL" -eq 0 ]] && [[ -d "$ROOT/.git" ]]; then
  if prompt_yn "Pull latest from origin?" y; then
    info "git pull --ff-only"
    if git pull --ff-only; then
      ok "Repository up to date"
    else
      warn "git pull failed (continue with local tree)"
    fi
  else
    info "Skipped git pull"
  fi
else
  info "No git remote pull (skipped or not a clone)"
fi

# ── Step 4: Dependencies ──────────────────────────────────────────────────────

step "4) npm dependencies"

if [[ "$MODE" == "reinstall" ]]; then
  info "Removing node_modules (keeping .env / data/)"
  rm -rf "$ROOT/node_modules"
fi

info "npm install"
npm install
ok "Dependencies installed"

# ── Step 5: .env configuration ────────────────────────────────────────────────

step "5) Environment (.env)"

if [[ ! -f "$ROOT/.env" ]]; then
  if [[ -f "$ROOT/.env.sample" ]]; then
    cp "$ROOT/.env.sample" "$ROOT/.env"
    ok "Created .env from .env.sample"
  else
    touch "$ROOT/.env"
    warn "Created empty .env"
  fi
else
  ok ".env already present (will update selected keys)"
fi

DEFAULT_PROVIDER="$(env_get ASTRA_MQTT_PROVIDER)"
DEFAULT_PROVIDER="${DEFAULT_PROVIDER:-hivemq}"
DEFAULT_URL="$(env_get ASTRA_MQTT_URL)"
DEFAULT_WS="$(env_get ASTRA_MQTT_WS_URL)"
DEFAULT_USER="$(env_get ASTRA_MQTT_USERNAME)"
DEFAULT_USER="${DEFAULT_USER:-mxpfastra}"
DEFAULT_PASS="$(env_get ASTRA_MQTT_PASSWORD)"
DEFAULT_ID="$(env_get ASTRA_AGENT_ID)"
DEFAULT_ID="${DEFAULT_ID:-astra-$(hostname -s 2>/dev/null || echo host)}"
DEFAULT_NAME="$(env_get ASTRA_AGENT_NAME)"
DEFAULT_NAME="${DEFAULT_NAME:-$DEFAULT_ID}"

info "Configure MQTT + agent identity (Enter keeps current/default)"

PROVIDER="$(prompt_value "MQTT provider" "$DEFAULT_PROVIDER")"
URL="$(prompt_value "MQTT URL (mqtts://…)" "$DEFAULT_URL")"
WS="$(prompt_value "MQTT WebSocket URL (optional)" "$DEFAULT_WS")"
USER="$(prompt_value "MQTT username" "$DEFAULT_USER")"
if [[ -n "$DEFAULT_PASS" ]]; then
  PASS="$(prompt_value "MQTT password (hidden; Enter keeps existing)" "" 1)"
  [[ -z "$PASS" ]] && PASS="$DEFAULT_PASS"
else
  PASS="$(prompt_value "MQTT password (hidden)" "" 1)"
fi
AGENT_ID="$(prompt_value "ASTRA_AGENT_ID" "$DEFAULT_ID")"
AGENT_NAME="$(prompt_value "ASTRA_AGENT_NAME" "$DEFAULT_NAME")"

if [[ -z "$URL" || -z "$USER" || -z "$PASS" || -z "$AGENT_ID" ]]; then
  fail "MQTT URL, username, password, and ASTRA_AGENT_ID are required."
  exit 1
fi

env_set ASTRA_MQTT_PROVIDER "$PROVIDER"
env_set ASTRA_MQTT_URL "$URL"
[[ -n "$WS" ]] && env_set ASTRA_MQTT_WS_URL "$WS"
env_set ASTRA_MQTT_USERNAME "$USER"
env_set ASTRA_MQTT_PASSWORD "$PASS"
env_set ASTRA_AGENT_ID "$AGENT_ID"
env_set ASTRA_AGENT_NAME "$AGENT_NAME"

ok ".env updated (secrets not printed)"

# Optional auth probe
if [[ -f "$ROOT/scripts/mqtt-auth-probe.mjs" ]]; then
  if prompt_yn "Test MQTT credentials against the broker now?" y; then
    if node "$ROOT/scripts/mqtt-auth-probe.mjs" astra; then
      ok "MQTT auth OK"
    else
      warn "MQTT auth failed — fix credentials in .env before starting the service"
    fi
  fi
fi

# ── Step 6: systemd (Linux) ───────────────────────────────────────────────────

step "6) Background service (systemd user)"

SERVICE_SCRIPT="$ROOT/deploy/install-service.sh"
if [[ "$SKIP_SERVICE" -eq 1 ]]; then
  info "Skipped (--skip-service)"
elif [[ "$OS" != Linux* ]]; then
  info "Not Linux — start manually with: npm start"
elif [[ ! -f "$SERVICE_SCRIPT" ]]; then
  warn "deploy/install-service.sh missing"
elif prompt_yn "Install/restart systemd user service (astra-agent)?" y; then
  bash "$SERVICE_SCRIPT"
  ok "Service installer finished"
else
  info "Skipped service. Start with: npm start"
fi

# ── Done ──────────────────────────────────────────────────────────────────────

step "Done"
hr
printf '%sNext steps%s\n' "$BOLD" "$RESET"
printf '  1. Ensure this agent is approved in AARIA (POST /fleet/approve)\n'
printf '  2. Logs: journalctl --user -u astra-agent.service -f\n'
printf '     or foreground: cd %s && npm start\n' "$ROOT"
printf '  3. Health job: POST /fleet/cmd {\"agentId\":\"%s\",\"action\":\"health\"}\n' "$AGENT_ID"
hr
ok "ASTRA $MODE complete"
