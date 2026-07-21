#!/usr/bin/env bash
# Probe local host and write/update HOST.md for ASTRA / AARIA awareness.
#
# Usage:
#   bash deploy/probe-host.sh
#   bash deploy/probe-host.sh --out PATH --purpose TEXT --notes TEXT
#   bash deploy/probe-host.sh --guess-only
#   bash deploy/probe-host.sh --refresh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/HOST.md"
PURPOSE=""
NOTES=""
GUESS_ONLY=0
REFRESH=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out) OUT="$2"; shift 2 ;;
    --purpose) PURPOSE="$2"; shift 2 ;;
    --notes) NOTES="$2"; shift 2 ;;
    --guess-only) GUESS_ONLY=1; shift ;;
    --refresh) REFRESH=1; shift ;;
    --help|-h)
      sed -n '2,9p' "$0"
      exit 0
      ;;
    *)
      printf 'Unknown option: %s\n' "$1" >&2
      exit 2
      ;;
  esac
done

have() { command -v "$1" >/dev/null 2>&1; }

version_of() {
  local bin="$1"
  have "$bin" || return 1
  case "$bin" in
    node) node -v 2>/dev/null | head -1 ;;
    npm) npm -v 2>/dev/null | head -1 ;;
    java) java -version 2>&1 | head -1 ;;
    php) php -v 2>/dev/null | head -1 ;;
    python3|python) "$bin" --version 2>/dev/null | head -1 ;;
    go) go version 2>/dev/null | head -1 ;;
    docker) docker --version 2>/dev/null | head -1 ;;
    nginx) nginx -v 2>&1 | head -1 ;;
    apache2|httpd) "$bin" -v 2>&1 | head -1 ;;
    mysql|mariadb) "$bin" --version 2>/dev/null | head -1 ;;
    psql) psql --version 2>/dev/null | head -1 ;;
    redis-server|redis-cli) "$bin" --version 2>/dev/null | head -1 ;;
    mongod|mongosh) "$bin" --version 2>/dev/null | head -1 ;;
    *) "$bin" --version 2>/dev/null | head -1 || "$bin" -v 2>&1 | head -1 ;;
  esac
}

unit_active() {
  local u="$1"
  if have systemctl; then
    systemctl is-active --quiet "$u" 2>/dev/null && return 0
    systemctl --user is-active --quiet "$u" 2>/dev/null && return 0
  fi
  return 1
}

guess_purpose() {
  local g="General Linux host"
  if unit_active nginx || unit_active apache2 || unit_active httpd || have nginx || have apache2 || have httpd; then
    g="Web server"
  elif unit_active mysql || unit_active mariadb || unit_active postgresql || unit_active redis-server || unit_active mongod; then
    g="Database / data services host"
  elif have docker && [[ -S /var/run/docker.sock ]]; then
    g="Container / Docker host"
  elif [[ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]]; then
    g="Desktop / personal workstation"
  elif [[ -f /sys/class/dmi/id/product_name ]]; then
    local prod
    prod="$(tr -d '\0' </sys/class/dmi/id/product_name 2>/dev/null || true)"
    if echo "$prod" | grep -qiE 'virtual|amazon|kvm|vmware|xen|qemu|openstack'; then
      g="Cloud VPS"
    fi
  fi
  printf '%s' "$g"
}

if [[ "$REFRESH" -eq 1 && -f "$OUT" ]]; then
  if [[ -z "$PURPOSE" ]]; then
    PURPOSE="$(awk '/^## Purpose/{getline; gsub(/^[[:space:]]+|[[:space:]]+$/,""); if(NF && $0 !~ /^\*\(none\)\*$/){print; exit}}' "$OUT" 2>/dev/null || true)"
  fi
  if [[ -z "$NOTES" ]]; then
    NOTES="$(awk '/^## Notes/{flag=1; next} /^## /{flag=0} flag{print}' "$OUT" 2>/dev/null | sed '/^\*\(none\)\*$/d' | paste -sd' ' - || true)"
  fi
fi

GUESSED="$(guess_purpose)"
if [[ "$GUESS_ONLY" -eq 1 ]]; then
  printf '%s\n' "$GUESSED"
  exit 0
fi

if [[ -z "$PURPOSE" ]]; then
  PURPOSE="$GUESSED"
fi

HOST_NAME="$(hostname -f 2>/dev/null || hostname 2>/dev/null || echo unknown)"
SHORT_NAME="$(hostname -s 2>/dev/null || echo unknown)"
OS_LINE=""
if [[ -f /etc/os-release ]]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  OS_LINE="${PRETTY_NAME:-$NAME $VERSION_ID}"
elif have sw_vers; then
  OS_LINE="macOS $(sw_vers -productVersion 2>/dev/null)"
else
  OS_LINE="$(uname -s)"
fi
KERNEL="$(uname -r 2>/dev/null || echo unknown)"
ARCH="$(uname -m 2>/dev/null || echo unknown)"
UPDATED="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

IPS=""
if have hostname; then
  IPS="$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -vE '^(127\.|::1|$)' | head -5 | tr '\n' ' ' | sed 's/[[:space:]]*$//' || true)"
fi
if [[ -z "$IPS" ]] && have ip; then
  IPS="$(ip -4 -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -5 | tr '\n' ' ' | sed 's/[[:space:]]*$//' || true)"
fi

CORES="$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo "?")"
MEM=""
if have free; then
  MEM="$(free -h 2>/dev/null | awk '/^Mem:/{print $2" total, "$7" available"}')"
elif have sysctl; then
  MEM="$(sysctl -n hw.memsize 2>/dev/null | awk '{printf "%.1fGi total", $1/1024/1024/1024}')"
fi
DISK="$(df -h / 2>/dev/null | awk 'NR==2{print $2" total, "$4" free ("$5" used)"}')"

runtimes_block() {
  local lines=()
  local b v
  for b in node npm java php python3 python go docker nginx apache2 httpd composer; do
    if v="$(version_of "$b" 2>/dev/null)"; then
      [[ -n "$v" ]] && lines+=("- **${b}**: ${v}")
    fi
  done
  if [[ ${#lines[@]} -eq 0 ]]; then
    echo "- *(none detected)*"
  else
    printf '%s\n' "${lines[@]}"
  fi
}

data_block() {
  local lines=()
  local b v u
  for b in mysql mariadb psql redis-server redis-cli mongod mongosh; do
    if v="$(version_of "$b" 2>/dev/null)"; then
      [[ -n "$v" ]] && lines+=("- **${b}**: ${v}")
    fi
  done
  for u in mysql mariadb postgresql redis-server redis mongod mongodb; do
    if unit_active "$u"; then
      lines+=("- **systemd**: \`${u}\` active")
    fi
  done
  if [[ ${#lines[@]} -eq 0 ]]; then
    echo "- *(none detected)*"
  else
    printf '%s\n' "${lines[@]}" | awk '!seen[$0]++'
  fi
}

services_block() {
  local lines=()
  local u
  for u in nginx apache2 httpd docker docker.service ssh sshd mysql mariadb postgresql redis-server mongod caddy traefik; do
    if unit_active "$u"; then
      lines+=("- \`${u}\` (active)")
    fi
  done
  if [[ ${#lines[@]} -eq 0 ]]; then
    echo "- *(no common units active — or no systemctl)*"
  else
    printf '%s\n' "${lines[@]}"
  fi
}

CLOUD_HINT=""
if [[ -f /sys/class/dmi/id/sys_vendor ]]; then
  CLOUD_HINT="$(tr -d '\0' </sys/class/dmi/id/sys_vendor 2>/dev/null || true)"
fi
if [[ -z "$CLOUD_HINT" && -f /sys/class/dmi/id/product_name ]]; then
  CLOUD_HINT="$(tr -d '\0' </sys/class/dmi/id/product_name 2>/dev/null || true)"
fi

{
  echo "# Host profile — ${HOST_NAME}"
  echo "Updated: ${UPDATED}"
  echo
  echo "## Purpose"
  echo "${PURPOSE}"
  echo
  echo "## Identity"
  echo "- **Hostname:** ${HOST_NAME} (\`${SHORT_NAME}\`)"
  echo "- **OS:** ${OS_LINE}"
  echo "- **Kernel:** ${KERNEL}"
  echo "- **Arch:** ${ARCH}"
  [[ -n "$IPS" ]] && echo "- **IPs:** ${IPS}"
  [[ -n "$CLOUD_HINT" ]] && echo "- **Hardware / cloud hint:** ${CLOUD_HINT}"
  echo
  echo "## Resources"
  echo "- **CPU cores:** ${CORES}"
  [[ -n "$MEM" ]] && echo "- **Memory:** ${MEM}"
  [[ -n "$DISK" ]] && echo "- **Disk (/):** ${DISK}"
  echo
  echo "## Runtimes & tools"
  runtimes_block
  echo
  echo "## Data services"
  data_block
  echo
  echo "## Notable services"
  services_block
  echo
  echo "## Notes"
  if [[ -n "$NOTES" ]]; then
    echo "${NOTES}"
  else
    echo "*(none)*"
  fi
  echo
} >"$OUT"

printf '%s\n' "$OUT"
