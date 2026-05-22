#!/usr/bin/env bash
# ============================================================================
# RT Connect — Ubuntu VM hardening script
#
# Locks the VM to the configured allowlist for SSH (22) and the Docker-
# published HTTPS service (80, 443). Adds fail2ban for SSH brute-force
# defence and enables Ubuntu unattended security upgrades.
#
# Usage:   sudo bash secure-vm.sh
#
# What it does (in order):
#   1. Pre-flight: must be root, must be on an allowlisted source IP
#      (otherwise enabling firewall would disconnect this SSH session)
#   2. Install ufw, fail2ban, iptables-persistent, unattended-upgrades
#   3. UFW: deny all incoming, allow outgoing, allow SSH only from allowlist
#   4. DOCKER-USER iptables chain: only allowlist IPs can reach
#      Docker-published ports 80 and 443
#   5. Persist iptables across reboots
#   6. fail2ban: ban SSH attackers after 5 failed attempts within 10 min
#   7. SSH hardening: MaxAuthTries=3, idle timeout, banner
#   8. Unattended-upgrades for Ubuntu security patches
#
# Rollback (from VM hypervisor console if you locked yourself out):
#       ufw disable
#       iptables -F DOCKER-USER
#       iptables -A DOCKER-USER -j RETURN
#       netfilter-persistent save
#       systemctl restart fail2ban
# ============================================================================

set -euo pipefail

# ── Config — edit these to change who can access the VM ────────────────────
# Full access: SSH (22) + web (80/443)
ALLOWED_IPS=(
    "10.10.0.100"    # VPN only — single source of admin access
)
# Web-only: can reach the app on 80/443 but NOT SSH
WEB_ONLY_IPS=(
    "10.185.1.60"    # workstation — app access only, no SSH
)
PROTECTED_PORTS=("80" "443")   # Docker-published — guarded by DOCKER-USER
SSH_PORT="22"

# ── Pretty output ──────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'
BOLD='\033[1m'; NC='\033[0m'
info() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
step() { echo -e "\n${BLUE}${BOLD}━━ $* ━━${NC}"; }
die()  { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# ── 1. Pre-flight ──────────────────────────────────────────────────────────
[[ $EUID -ne 0 ]] && die "Must run as root:  sudo bash secure-vm.sh"

step "Pre-flight"
echo "  Allowlisted IPs (will be the ONLY ones that can reach this VM):"
for ip in "${ALLOWED_IPS[@]}"; do echo "    • $ip"; done

# Detect the SSH source IP of the current session
CURRENT_IP=""
if [[ -n "${SSH_CLIENT:-}" ]]; then
    CURRENT_IP="${SSH_CLIENT%% *}"
elif [[ -n "${SSH_CONNECTION:-}" ]]; then
    CURRENT_IP="${SSH_CONNECTION%% *}"
fi

if [[ -n "$CURRENT_IP" ]]; then
    IS_ALLOWED=false
    for ip in "${ALLOWED_IPS[@]}"; do
        [[ "$CURRENT_IP" == "$ip" ]] && IS_ALLOWED=true
    done
    if $IS_ALLOWED; then
        info "Your current SSH IP $CURRENT_IP is in the allowlist — safe to proceed."
    else
        warn "Your current SSH IP $CURRENT_IP is NOT in the allowlist."
        warn "Enabling these rules WILL DISCONNECT THIS SESSION immediately."
        warn "If you continue, you must use the VM's hypervisor console to undo."
        read -rp "Type the word 'continue' to proceed anyway: " confirm
        [[ "$confirm" == "continue" ]] || die "Aborted (safe)."
    fi
else
    warn "Could not detect your SSH source IP (you might be on the console)."
fi

# ── 2. Install packages ────────────────────────────────────────────────────
step "Installing security packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
    ufw fail2ban iptables-persistent unattended-upgrades >/dev/null
info "Installed ufw, fail2ban, iptables-persistent, unattended-upgrades"

# ── 3. UFW — host firewall (for SSH + anything not Docker-published) ───────
step "Configuring UFW (host firewall)"

# Reset so re-running this script is idempotent
ufw --force reset >/dev/null

ufw default deny incoming  >/dev/null
ufw default allow outgoing >/dev/null

# SSH only from the allowlist
for ip in "${ALLOWED_IPS[@]}"; do
    ufw allow from "$ip" to any port "$SSH_PORT" proto tcp comment "SSH allowlist" >/dev/null
done

# Allow inbound ping from allowlist (helpful for diagnostics)
# Note: UFW handles ICMP via the global config; we just allow it for our IPs.
for ip in "${ALLOWED_IPS[@]}"; do
    ufw allow from "$ip" proto icmp >/dev/null 2>&1 || true
done

ufw --force enable >/dev/null
info "UFW enabled, SSH locked to allowlist"
ufw status numbered | sed 's/^/    /'

# ── 4. DOCKER-USER — Docker-published ports (80, 443) ──────────────────────
step "Configuring iptables DOCKER-USER chain (for Docker ports)"

# Detect external interface so we ONLY filter packets arriving from outside.
# Filtering blindly on port also catches container OUTBOUND traffic (e.g.,
# npm install reaching out to registry.npmjs.org:443) which breaks builds.
EXT_IF=$(ip route get 8.8.8.8 2>/dev/null | awk '/dev/ {for(i=1;i<=NF;i++) if($i=="dev") print $(i+1)}')
if [[ -z "$EXT_IF" ]]; then
    EXT_IF=$(ip -o link show | awk -F': ' '!/lo:|docker|br-|veth/ {print $2; exit}')
fi
info "External interface detected: $EXT_IF"

# Make sure the chain exists (Docker creates it when daemon starts)
if ! iptables -L DOCKER-USER -n >/dev/null 2>&1; then
    iptables -N DOCKER-USER
fi

# Reset our chain — then rebuild
iptables -F DOCKER-USER

# 4a. Allow return traffic for existing connections (host or container)
iptables -A DOCKER-USER -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN

# 4b. Allow allowlisted IPs (full access) arriving on the EXTERNAL interface only
for ip in "${ALLOWED_IPS[@]}"; do
    for port in "${PROTECTED_PORTS[@]}"; do
        iptables -A DOCKER-USER -i "$EXT_IF" -p tcp -s "$ip" --dport "$port" -j RETURN
    done
done

# 4b-bis. Web-only IPs — reach 80/443 but never SSH (SSH is guarded by UFW,
# and we deliberately do NOT add these IPs to the UFW SSH allowlist).
for ip in "${WEB_ONLY_IPS[@]:-}"; do
    [[ -z "$ip" ]] && continue
    for port in "${PROTECTED_PORTS[@]}"; do
        iptables -A DOCKER-USER -i "$EXT_IF" -p tcp -s "$ip" --dport "$port" -j RETURN
    done
done

# 4c. Log + drop everything ELSE arriving on the external interface to those ports
for port in "${PROTECTED_PORTS[@]}"; do
    iptables -A DOCKER-USER -i "$EXT_IF" -p tcp --dport "$port" \
        -m limit --limit 5/min --limit-burst 10 \
        -j LOG --log-prefix "FW-DROP $port: " --log-level 4
    iptables -A DOCKER-USER -i "$EXT_IF" -p tcp --dport "$port" -j DROP
done

# 4d. Default: let any other traffic (container outbound, container↔container)
#      continue through Docker's chain
iptables -A DOCKER-USER -j RETURN

info "DOCKER-USER rules installed"
iptables -L DOCKER-USER -n -v --line-numbers | sed 's/^/    /'

# ── 5. Persist iptables ────────────────────────────────────────────────────
step "Persisting iptables rules"
netfilter-persistent save >/dev/null
info "Rules saved — they'll survive a reboot"

# ── 6. fail2ban ─────────────────────────────────────────────────────────────
step "Configuring fail2ban (SSH brute-force protection)"
cat > /etc/fail2ban/jail.local <<EOF
# Auto-generated by secure-vm.sh
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5
backend  = systemd
# Never ban our own allowlist IPs even if they fat-finger the password
ignoreip = 127.0.0.1/8 ::1 ${ALLOWED_IPS[*]}

[sshd]
enabled = true
port    = ${SSH_PORT}
EOF
systemctl enable fail2ban >/dev/null 2>&1
systemctl restart fail2ban
info "fail2ban active"
fail2ban-client status sshd 2>/dev/null | sed 's/^/    /' || true

# ── 7. SSH hardening ───────────────────────────────────────────────────────
step "SSH hardening (keeping password auth — flagged for later)"
SSHD=/etc/ssh/sshd_config
cp -n "$SSHD" "$SSHD.before-hardening.$(date +%Y%m%d_%H%M%S)" || true

# Helper: set a key=value pair in sshd_config, replacing any existing version
set_sshd() {
    local key="$1" value="$2"
    sed -i "/^[#[:space:]]*${key}[[:space:]]/d" "$SSHD"
    echo "${key} ${value}" >> "$SSHD"
}

set_sshd "MaxAuthTries"        "3"
set_sshd "LoginGraceTime"      "30"
set_sshd "ClientAliveInterval" "300"
set_sshd "ClientAliveCountMax" "2"
set_sshd "X11Forwarding"       "no"
set_sshd "PermitEmptyPasswords" "no"
# Leave PermitRootLogin and PasswordAuthentication as-is per user preference

# Validate before applying
sshd -t || { warn "sshd config check FAILED — restoring backup"; cp "$SSHD.before-hardening."* "$SSHD"; exit 1; }
systemctl reload ssh 2>/dev/null || systemctl reload sshd
info "SSH hardened (MaxAuthTries=3, idle timeout 10 min)"

# ── 8. Unattended security upgrades ────────────────────────────────────────
step "Enabling automatic Ubuntu security updates"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true
info "Security patches will install automatically"

# ── 9. Summary ─────────────────────────────────────────────────────────────
cat <<EOF

${GREEN}${BOLD}┌─────────────────────────────────────────────────────────────────┐
│  Hardening complete                                              │
└─────────────────────────────────────────────────────────────────┘${NC}

  ${BOLD}Who can reach this VM:${NC}
$(for ip in "${ALLOWED_IPS[@]}"; do echo "    • $ip"; done)

  ${BOLD}Open ports (only from above):${NC}
    • 22  (SSH)
    • 80  (HTTP — redirects to HTTPS)
    • 443 (HTTPS — the RT Connect app)

  ${BOLD}Verify:${NC}
    ufw status verbose
    iptables -L DOCKER-USER -n -v
    fail2ban-client status sshd
    journalctl -u fail2ban -n 20

  ${BOLD}Test from a NOT-allowed IP (should time out):${NC}
    curl --max-time 5 https://$CURRENT_IP   # or your VM's public IP

  ${BOLD}Watch live DROP log:${NC}
    journalctl -k -f | grep FW-DROP

  ${YELLOW}${BOLD}Next-step recommendations (not done by this script):${NC}
    1. Generate an SSH key on your workstation, copy to the VM:
         ssh-keygen -t ed25519
         ssh-copy-id root@${ALLOWED_IPS[0]}
    2. Disable password SSH login:
         sed -i 's/^[#[:space:]]*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
         systemctl reload ssh
    3. Create a non-root sudo user, then disable root SSH entirely:
         adduser ops
         usermod -aG sudo,docker ops
         echo 'PermitRootLogin no' >> /etc/ssh/sshd_config && systemctl reload ssh

  ${BOLD}If you ever lock yourself out:${NC}
    Get on the VM's hypervisor console and run:
      ufw disable && iptables -F DOCKER-USER && iptables -A DOCKER-USER -j RETURN
      netfilter-persistent save

EOF
