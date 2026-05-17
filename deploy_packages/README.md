# RT Connect — Docker Deployment

A self-contained Docker Compose stack: **Caddy (HTTPS) + frontend + backend + PostgreSQL**.
Designed for client demos and small/medium production deployments on a single
server (Linux or Windows with Docker Desktop).

> **Two guides depending on your audience:**
> - [QUICKSTART.md](QUICKSTART.md) — plain-language guide for non-IT staff
> - [INSTALL_GUIDE.md](INSTALL_GUIDE.md) — step-by-step deployment with
>   troubleshooting from real installs (recommended for first deployment)
>
> This README is the architectural / ops reference.

---

## Architecture

```
                  ┌─────────────────┐
                  │  Client browser │   https://<server-ip>/
                  └────────┬────────┘
                           │  port 443 (HTTPS) / port 80 (redirects to 443)
                  ┌────────▼─────────┐
                  │  caddy (proxy)   │   Auto self-signed cert (tls internal)
                  │ rtconnect-proxy  │   Local CA, no public domain needed
                  └────────┬─────────┘
                           │  internal docker network
                  ┌────────▼─────────┐
                  │  frontend (web)  │   Nginx serves React SPA
                  │  rtconnect-web   │   + reverse-proxies /api/*
                  └────────┬─────────┘
                           │  internal docker network
                  ┌────────▼─────────┐
                  │  backend (api)   │   FastAPI + Uvicorn
                  │  rtconnect-api   │   talks to ZKTeco devices on LAN
                  └────────┬─────────┘
                           │
                  ┌────────▼─────────┐
                  │  postgres (db)   │   data persisted in named volume
                  │  rtconnect-db    │
                  └──────────────────┘
```

Only ports **80** and **443** (or whatever you set in `HTTP_PORT` / `HTTPS_PORT`)
are exposed to the LAN. Frontend Nginx, backend API, and Postgres are reachable
only through the internal docker network — never directly from outside.

### Why Caddy with `tls internal` (not Let's Encrypt)?

Let's Encrypt requires a public domain name and either HTTP-01 (server
reachable from the public internet on port 80) or DNS-01 (a public DNS zone
you control). A LAN-only deployment has neither, so Caddy's built-in local
CA is the right tool. It generates and rotates a cert for whatever IP /
hostname clients use, valid for ~1 year, signed by a CA that lives in the
`caddy_data` volume.

To remove the browser warning, install the CA on each client machine:

```bash
./extract-ca.sh           # writes ./rtconnect-ca.crt
# distribute that file and install in each client's trust store.
```

(See [QUICKSTART.md](QUICKSTART.md#step-5--open-the-app-from-any-computer-in-the-office) for OS-by-OS install instructions.)

---

## Prerequisites

- **Docker Engine** + Docker Compose v2 (Linux), or **Docker Desktop**
  (Windows / macOS).
- The host must have network access to the ZKTeco devices on the same LAN.
- ~2 GB free disk for images and database.

---

## First-time setup

### 1. Configure

Copy the example environment file and edit it:

```bash
# Linux / macOS
cp .env.example .env
nano .env

# Windows
copy .env.example .env
notepad .env
```

Important values:

| Variable          | What it does |
|-------------------|--------------|
| `SERVER_IP`       | IP of this server on the client's LAN (used in CORS) |
| `HTTP_PORT`       | Public port (default 80; use 8080 if 80 is busy) |
| `ALLOWED_ORIGINS` | Comma-separated list — must include `http://SERVER_IP[:HTTP_PORT]` |
| `DB_PASSWORD`     | Strong password for the Postgres user |
| `TZ`              | Server timezone (default `Africa/Casablanca`) |

### 2. Refresh source from the project (developer machine only)

```bash
./build.sh        # Linux / macOS
build.bat         # Windows
```

This copies fresh code from `../backend-api` and `../frontend` into the build
contexts so Docker can build the images. **Skip this step on a client's
machine** — they only need the already-populated folder.

### 3. Build images and start the stack

```bash
./start.sh        # Linux / macOS
start.bat         # Windows
```

First run takes 3-5 minutes (npm install + pip install). Subsequent restarts
take seconds.

### 4. Open the app

Browse to `http://<SERVER_IP>:<HTTP_PORT>` (or just `http://<SERVER_IP>` if
`HTTP_PORT=80`).

Default login: **admin / admin123** — change it after first sign-in.

---

## Day-to-day operations

| Task | Command |
|------|---------|
| Tail logs (all services) | `./logs.sh` / `logs.bat` |
| Tail logs (one service)  | `./logs.sh backend` |
| Stop everything          | `./stop.sh` / `stop.bat` |
| Start again              | `./start.sh` / `start.bat` |
| Restart only the API     | `docker compose restart backend` |
| Update after code change | `./build.sh && ./start.sh` |
| Open shell in API        | `docker compose exec backend bash` |
| Open psql prompt         | `docker compose exec postgres psql -U $DB_USER -d $DB_NAME` |

---

## Backups

Manual:
```bash
./backup.sh                          # writes ./backups/<db>_<timestamp>.sql.gz
./restore.sh backups/<file>.sql.gz   # restores after confirmation
```

Nightly cron on Linux:
```cron
0 2 * * * cd /opt/rtconnect/deploy_packages && ./backup.sh >> backups/backup.log 2>&1
```

Backups older than 30 days are pruned automatically (override with
`BACKUP_KEEP_DAYS` in `.env`).

The Postgres data volume `postgres_data` survives `docker compose down`. To
**fully wipe** (rare — for clean testing):
```bash
docker compose down -v        # removes volumes too
```

---

## Locking the VM to specific IPs (optional)

By default the stack listens on all interfaces and any host that can route
to the VM can browse the app. To restrict access to a known IP allowlist
(SSH + 80 + 443), edit and run **`secure-vm.sh`**:

```bash
nano secure-vm.sh            # set ALLOWED_IPS at the top
sudo bash secure-vm.sh
```

What it installs and configures:

| Layer | Purpose |
|------|---------|
| **UFW** | host firewall — SSH (22) only from your allowlist |
| **DOCKER-USER iptables chain** | Caddy ports 80/443 only from your allowlist. Filter is bound to the *external* interface (`-i eth0` / `-i ens18`) so the rules **never block container-outbound traffic** (npm install, apt-get, docker pulls, ZKTeco device polls all continue to work) |
| **fail2ban** | 5 failed SSH attempts in 10 min → 1 h ban (your allowlist is exempt) |
| **iptables-persistent** | DOCKER-USER rules survive reboot |
| **unattended-upgrades** | Ubuntu security patches install daily |

The script:
- refuses to run if not root
- aborts before touching the firewall if your current SSH source IP isn't in the allowlist (no accidental lockout)
- ssh hardening is conservative — root login and password auth stay on by default. The summary at the end walks you through the next-step hardening once you have an SSH key set up.

If you ever need to undo it, the summary printed by `secure-vm.sh` includes the exact rollback commands.

---

## Networking notes

### Reaching ZKTeco devices on the LAN

The backend container uses Docker's default bridge network, so outbound
traffic is NATed through the host. The backend can reach any IP the host can
reach, including ZKTeco devices on `10.x.x.x` / `192.168.x.x` subnets — no
extra configuration needed.

### Changing the public port

Set `HTTP_PORT=8080` in `.env`, then `./start.sh`. Update `ALLOWED_ORIGINS`
to include `http://SERVER_IP:8080`.

### Multiple deployments on one host

Each deployment gets its own `deploy_packages/` folder. Differentiate with:
- A unique `HTTP_PORT` per deployment
- A unique container name prefix (edit `container_name:` in `docker-compose.yml`)
- A unique volume name in the `volumes:` block

---

## Updating to a new version

On the developer machine:
```bash
cd deploy_packages
./build.sh                            # refresh source
docker compose build --no-cache       # force rebuild
docker compose up -d                  # rolling restart
```

For a client demo, ship the whole `deploy_packages/` folder (with sources
already populated) as a zip.

---

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| `start.sh` says "Docker is not running" | Start Docker Desktop / `systemctl start docker` |
| Frontend shows but API calls fail | Check `docker compose logs backend` |
| Devices unreachable from backend | Verify host can `ping <device-ip>`; check firewall |
| "Cross-origin" errors in browser | Add the URL you typed (with port) to `ALLOWED_ORIGINS` |
| Postgres healthcheck failing  | Wrong `DB_PASSWORD` — `docker compose down -v` and try again |

To check what each container reports:
```bash
docker compose ps          # service status + healthchecks
docker compose logs -f     # live logs
```
