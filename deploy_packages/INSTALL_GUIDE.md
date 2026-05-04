# RT Connect — Step-by-Step Deployment Guide

> A practical install walkthrough based on the real deployment performed
> on a Windows server with Docker Desktop. Every command shown was actually
> run; every error encountered is documented with its fix in the
> Troubleshooting section.

---

## Audience and prerequisites

| Item | Required |
|------|----------|
| **Server hardware** | 2 CPU cores, 4 GB RAM, 10 GB free disk |
| **Operating system** | Windows 10/11 with Docker Desktop, **or** Ubuntu 22.04+ with Docker Engine |
| **Network** | Server must be reachable by clients on the LAN |
| **Skills** | Comfortable opening PowerShell / a terminal and running commands |

---

## Part 1 — One-time setup

### 1.1 Install Docker Desktop (Windows)

1. Open <https://www.docker.com/products/docker-desktop> and download the
   Windows installer.
2. Run it, accept defaults, **restart the PC** when prompted.
3. After the restart, launch **Docker Desktop**. Wait until the whale icon
   in the system tray stops animating — that means Docker is ready.

Verify in PowerShell:

```powershell
docker version
```

You should see both **Client** and **Server** version blocks. If only
"Client" appears, Docker isn't running yet — wait for Docker Desktop to
finish starting.

### 1.2 (Linux only) Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# log out and back in so the group change takes effect
```

### 1.3 Get the deployment package

Either copy the `deploy_packages/` folder onto the server, or:

```powershell
git clone https://github.com/karirhamid/rt_connect.git
cd rt_connect/deploy_packages
.\build.bat            # populates backend/ and frontend/ source from the project
```

> The `build` script copies `../backend-api/` → `deploy_packages/backend/`
> and `../frontend/` → `deploy_packages/frontend/`. **Run it whenever the
> source code changes.**

---

## Part 2 — Configure the deployment

### 2.1 Find the server's IP

Open **PowerShell** (or a terminal) and type:

```powershell
ipconfig | findstr IPv4
```

Sample output:
```
   Adresse IPv4. . . . . : 10.0.85.101
   Adresse IPv4. . . . . : 172.16.1.10
   Adresse IPv4. . . . . : 192.168.1.9
   Adresse IPv4. . . . . : 192.168.48.1
```

Pick the IP that **clients on your office network can reach**. If the
server has multiple network adapters (Wi-Fi + Ethernet + VPN), pick the
one on the same subnet as your client PCs.

### 2.2 Create your `.env`

```powershell
cd C:\path\to\deploy_packages
Copy-Item .env.example .env
notepad .env
```

In Notepad, change at minimum:

```env
SERVER_IP=172.16.1.10                                   # the IP you picked
DB_PASSWORD=ChangeThisToASomethingStrong123!            # invent one, save it
ALLOWED_ORIGINS=https://172.16.1.10,http://172.16.1.10,https://localhost
TZ=Africa/Casablanca                                    # adjust if needed
```

> The `SERVER_IP` value is just a label used for documentation and CORS.
> The actual binding is `0.0.0.0` (all interfaces) — Docker listens on
> every IP the host already owns. **You cannot use an IP that doesn't
> belong to this PC** (verified by `ipconfig`).

Save and close.

---

## Part 3 — Bring up the stack (4 services, in order)

The stack is built in 4 layers. Bringing them up one at a time makes it
easy to verify each piece before moving on.

### 3.1 Database (PostgreSQL)

```powershell
docker compose up -d postgres
```

This pulls the `postgres:16-alpine` image (~25 s on first run), creates
a Docker network and a persistent volume, and starts the database. Verify:

```powershell
docker compose ps postgres
```

Expected status: `Up X seconds (healthy)`. The healthcheck takes ~10 s.

Optional sanity check (uses the username from your `.env`):

```powershell
docker compose exec postgres psql -U $env:DB_USER -d rtzkconnect_db -c "\dt"
```

> *"Did not find any relations"* is **expected and correct** at this
> stage — the backend creates tables on its first start.

### 3.2 Backend (FastAPI)

```powershell
docker compose up -d --build backend
```

First run downloads `python:3.11-slim` (~30 MB), installs system packages
(libpq-dev, gcc, etc.), then `pip install`s the Python dependencies.
**Total: 90–180 seconds**.

When the prompt returns:

```powershell
docker compose ps backend
docker compose logs --tail 30 backend
```

You're looking for a clean startup log with these lines, in order:

```
INFO:     Started server process [1]
INFO:     Waiting for application startup.
... main - INFO - Initializing database...
... main - INFO - Database initialized
... main - INFO - Recomputed next_run_at for all active schedules
... main - INFO - Created default AppSettings
... main - INFO - Seeded admin user (username=admin, password=admin123)
... main - INFO - Migrated 2 device(s) from JSON store into PostgreSQL
... main - INFO - Ready — all sync is manual from the device menu.
... app.services.scheduler - INFO - Scheduler thread started
... main - INFO - Report scheduler started
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     127.0.0.1:xxxxx - "GET /health HTTP/1.1" 200 OK
```

The last line confirms the healthcheck is passing. `docker compose ps`
should now show `Up X seconds (healthy)` for the backend.

### 3.3 Frontend (Nginx) and Reverse Proxy (Caddy)

```powershell
docker compose up -d --build frontend caddy
```

This is the longest step:
- **Frontend build (~3–5 min)**: pulls Node 20, runs `npm ci` to install
  React + Vite + lucide-react + i18next + recharts + tailwind, then runs
  `npm run build` to bundle the SPA. Output is copied into a fresh Nginx
  image.
- **Caddy (~10 s)**: just pulls `caddy:2-alpine` and starts.

When done:

```powershell
docker compose ps
```

All four containers should show `Up`:

```
NAME              STATUS
rtconnect-db      Up X minutes (healthy)
rtconnect-api     Up X minutes (healthy)
rtconnect-web     Up X seconds (health: starting → healthy)
rtconnect-proxy   Up X seconds                  → exposes 0.0.0.0:80, :443
```

Quick sanity:

```powershell
docker compose logs --tail 20 caddy
```

You want to see, in order:
```
... "started background certificate maintenance"
... "server running" (srv0, port 443)
... "server running" (srv1, port 80)
... "installing root certificate"
... "certificate installed properly in linux trusts"
... "serving initial configuration"
```

---

## Part 4 — Verify and access

### 4.1 Quick test from the server

```powershell
# Test the HTTP→HTTPS redirect
curl.exe -v http://localhost
# Expect: HTTP/1.1 301 Moved Permanently  → Location: https://localhost/

# Test the API through Caddy from inside the container
docker exec rtconnect-proxy wget -qO- --no-check-certificate https://localhost/api/public/ping
# Expect: {"ok":true}
```

> **About `curl.exe -k` on Windows:** Windows curl uses *schannel* which
> doesn't actually skip self-signed cert checks — it'll often fail with
> `SEC_E_ILLEGAL_MESSAGE`. **Browsers and `wget --no-check-certificate`
> work correctly.** Use those for testing.

### 4.2 Open the app

In any browser on the server **or any client PC on the LAN**:

```
https://172.16.1.10        ← whatever you put in SERVER_IP
https://localhost          ← only from the server itself
```

You'll see **"Your connection is not private"**. This is normal: Caddy
generates a self-signed certificate from a local CA (no public domain
involved). Click:

- **Advanced** → **Proceed to 172.16.1.10 (unsafe)**

Login: **admin / admin123**. Change the password from the profile menu
right after you log in.

### 4.3 (Optional) Remove the cert warning forever

Run once on the server:

```powershell
.\extract-ca.bat
```

This produces `rtconnect-ca.crt` in the folder. Distribute that file to
each client computer (USB key, network share, email). On each client:

- **Windows** — double-click the `.crt` file → *Install Certificate* →
  *Local Machine* → *Place all certificates in the following store* →
  *Browse* → **Trusted Root Certification Authorities** → Next → Finish.
- **macOS** — double-click → it opens *Keychain Access* in the *System*
  keychain → set **Always Trust** for SSL.
- **Linux** — `sudo cp rtconnect-ca.crt /usr/local/share/ca-certificates/`
  then `sudo update-ca-certificates`.
- **Android** — Settings → Security → Encryption & credentials → Install
  certificate → CA certificate.

Restart the browser on the client. The padlock turns green.

---

## Part 5 — Day-to-day operations

| Task | Command |
|------|---------|
| Tail logs (all services) | `docker compose logs -f --tail 200` |
| Tail logs (one service) | `docker compose logs -f backend` |
| Stop everything | `docker compose down` (data preserved) |
| Stop **and wipe data** | `docker compose down -v` (rare — full reset) |
| Start again after stop | `docker compose up -d` |
| Restart only the backend | `docker compose restart backend` |
| Update after a code change | `.\build.bat ; docker compose up -d --build` |
| Open shell in backend | `docker compose exec backend bash` |
| Open psql | `docker compose exec postgres psql -U rtconnect_user -d rtzkconnect_db` |
| Make a backup | `.\backup.bat` (writes to `backups\<timestamp>.sql.gz`) |
| Restore a backup | `.\restore.bat backups\<file>.sql.gz` |

After a server reboot, just open Docker Desktop. Containers auto-restart
(`restart: unless-stopped`). To make Docker Desktop start with Windows:
*Settings → General → Start Docker Desktop when you sign in*.

---

## Troubleshooting (real issues encountered, with fixes)

### Issue 1 — Backend container immediately exited: `ModuleNotFoundError: No module named 'passlib'`

**Symptom**
```
File "/app/app/core/security.py", line 3, in <module>
    from passlib.context import CryptContext
ModuleNotFoundError: No module named 'passlib'
```

**Cause** — The original `requirements.txt` was missing the auth
libraries that the current code uses.

**Fix** — Add to `backend/requirements.txt`:
```
passlib[bcrypt]==1.7.4
python-jose[cryptography]==3.3.0
bcrypt==4.0.1
requests==2.31.0
```
Already applied in this package. If you see this error in a future
deployment, it likely means you also need to add a newer dependency.

```powershell
docker compose up -d --build backend
```

---

### Issue 2 — Backend startup error: `duplicate key value violates unique constraint "pg_type_typname_nsp_index"`

**Symptom**
```
sqlalchemy.exc.IntegrityError: (psycopg2.errors.UniqueViolation)
duplicate key value violates unique constraint "pg_type_typname_nsp_index"
DETAIL:  Key (typname, typnamespace)=(shifttype, 2200) already exists.
[SQL: CREATE TYPE shifttype AS ENUM ('REGULAR', 'NIGHT', ...)]
ERROR:    Application startup failed. Exiting.
```

**Cause** — Uvicorn was started with `--workers 2`. Both worker
processes ran the database initialization in parallel; one tried to
create the same PostgreSQL ENUM type the other had just made.

**Fix** — Set `--workers 1` in the backend Dockerfile (already applied):
```dockerfile
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
```
A single async worker handles plenty of load for an attendance system.
Rebuild:
```powershell
docker compose up -d --build backend
```

---

### Issue 3 — TLS handshake fails: `SEC_E_ILLEGAL_MESSAGE` / `SSL alert number 80`

**Symptom — browser or curl on Windows**
```
schannel: next InitializeSecurityContext failed:
SEC_E_ILLEGAL_MESSAGE (0x80090326) - This error usually occurs when a
fatal SSL/TLS alert is received (e.g. handshake failed).
```

**Symptom — `wget` from inside the container**
```
SSL routines:ssl3_read_bytes:tlsv1 alert internal error:
ssl/record/rec_layer_s3.c:918:SSL alert number 80
```

**Symptom — Caddy startup log**
```
"server is listening only on the HTTPS port but has no TLS connection
policies; adding one to enable TLS"
```

**Cause** — Caddy with a port-only catch-all (`:443`) cannot apply
`tls internal` because there's no hostname pattern for it to issue a
cert against. Caddy adds an empty TLS policy and the handshake fails
because there's no cert to serve.

**Fix** — Switch to **on-demand TLS** with the internal issuer.
Already applied in `caddy/Caddyfile`. The key directives:

```caddy
{
    on_demand_tls {
        ask http://backend:8000/health    # always returns 200
    }
}

:443 {
    tls {
        on_demand
        issuer internal
    }
    reverse_proxy frontend:80
}
```

How it works: when a client connects with any hostname/IP, Caddy queries
the backend's `/health` endpoint to confirm it's allowed (always yes),
then generates a fresh cert from the local CA on the fly.

To apply the fix without rebuilding (Caddyfile is mounted as a volume):
```powershell
docker compose restart caddy
docker compose logs --tail 10 caddy
```

---

### Issue 4 — Wrong PostgreSQL role name

**Symptom**
```
psql: error: ... FATAL:  role "rtconnect" does not exist
```

**Cause** — You set `DB_USER=rtconnect_user` in `.env` (or any other
custom value), but you tried to connect with the default `rtconnect`.

**Fix** — Always use the username from your own `.env`:
```powershell
docker compose exec postgres psql -U rtconnect_user -d rtzkconnect_db
```

---

### Issue 5 — `https://172.16.1.10` works on the server but not from another PC

**Likely causes and checks** (run them in order):

1. **Wrong IP in `.env`** — verify the IP belongs to **this** PC:
   ```powershell
   ipconfig | findstr IPv4
   ```
   If 172.16.1.10 isn't in the list, update `.env` with one that is.

2. **Windows Firewall** is blocking ports 80/443. Allow them:
   ```powershell
   New-NetFirewallRule -DisplayName "RT Connect HTTP"  -Direction Inbound -Protocol TCP -LocalPort 80  -Action Allow
   New-NetFirewallRule -DisplayName "RT Connect HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow
   ```

3. **Different subnet** — the client PC isn't on the same network as the
   server. Verify with `ping <server-ip>` from the client.

4. **VPN / multiple adapters** — the IP you chose is on an interface
   the client can't reach. Try a different IP from `ipconfig`.

---

### Issue 6 — Caddy log: `failed to sufficiently increase receive buffer size`

```
failed to sufficiently increase receive buffer size (was: 208 kiB,
wanted: 7168 kiB, got: 416 kiB).
```

**This is harmless.** It only affects HTTP/3 (UDP) throughput on
sustained heavy traffic. HTTPS over TCP/HTTP2 (what browsers use by
default for self-signed certs) works fine. **Ignore it.**

---

### Issue 7 — Build fails on Windows: `xcopy` says "file not found" or `cmd not recognized`

**Cause** — `build.bat` was created with Unix line endings (LF). Windows
CMD parses each line as a command and fails.

**Fix** — Re-save the file with Windows (CRLF) line endings, or just use
`build.sh` from Git Bash / WSL on the developer machine. The
`deploy_packages` repo includes both versions.

If you're packaging this from a developer machine, run:
```powershell
$bat = Get-ChildItem deploy_packages\*.bat
foreach ($f in $bat) {
  $c = [IO.File]::ReadAllText($f.FullName)
  [IO.File]::WriteAllText($f.FullName, ($c -replace "(?<!`r)`n", "`r`n"))
}
```

---

## Quick reference card

```
┌───────────────────────────────────────────────────────────────────┐
│  FIRST DEPLOYMENT                                                 │
│    1. Install Docker Desktop                                      │
│    2. Find IP:           ipconfig | findstr IPv4                  │
│    3. Configure:         Copy-Item .env.example .env ; notepad .env│
│    4. DB:                docker compose up -d postgres            │
│    5. Backend:           docker compose up -d --build backend     │
│    6. Frontend + Caddy:  docker compose up -d --build frontend caddy
│    7. Verify:            docker compose ps                        │
│    8. Open:              https://<server-ip>  → Advanced → Proceed│
│    9. Log in:            admin / admin123  (then change password) │
│   10. Optional:          extract-ca.bat → install on each client  │
│                                                                   │
│  EVERY DAY                                                        │
│    Nothing. Auto-restart on reboot.                               │
│                                                                   │
│  TROUBLE                                                          │
│    docker compose ps                  see service status          │
│    docker compose logs -f <service>   live tail                   │
│    docker compose restart <service>   restart one piece           │
│    docker compose down ; up -d        full restart                │
│                                                                   │
│  BACKUPS                                                          │
│    backup.bat                  manual backup                      │
│    restore.bat backups\X.gz    restore from a backup              │
└───────────────────────────────────────────────────────────────────┘
```
