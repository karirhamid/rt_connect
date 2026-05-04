# RT Connect — Quick Start Guide

> **Who is this for?** Anyone — including non-IT staff or junior IT — installing
> RT Connect on a server in a local office network. No experience required.
> Just follow the steps in order.

---

## Before you start: what you need

| Item | Why |
|------|-----|
| A computer that will run RT Connect (the **server**) | Hosts the database + app for everyone in the office |
| The server's IP address on your office network (e.g. `192.168.1.50`) | Other computers reach the app at this address |
| Admin (Administrator on Windows / sudo on Linux) on the server | To install Docker |
| The `deploy_packages` folder (this folder) | Contains everything else |

**Server requirements (low):** 2 CPU cores, 4 GB RAM, 10 GB free disk. Any modern PC, mini-PC, or VM works.

---

## Step 1 — Install Docker on the server (one time, ~10 minutes)

Docker is the engine that runs RT Connect. You install it once.

### On Windows
1. Open this link in a browser: <https://www.docker.com/products/docker-desktop>
2. Click **Download for Windows** → run the installer.
3. Accept all defaults. The installer will ask you to **restart the PC**. Restart.
4. After restart, **open Docker Desktop** (it appears in your Start menu). Wait for the whale icon in the tray to stop animating — that means Docker is ready.
5. **You're done with this step.** No further Docker config is needed.

### On Ubuntu / Linux
Open a terminal and run:
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# Log out and back in so the group change takes effect.
```

### How to check it works
Open a terminal (PowerShell on Windows) and type:
```
docker version
```
If you see version numbers, Docker is installed and running. If not, start Docker Desktop again.

---

## Step 2 — Find the server's IP address

You need to know the IP address that other computers in the office will use to reach the app.

### On Windows
1. Open **Command Prompt** (press `Win+R`, type `cmd`, Enter).
2. Type:
   ```
   ipconfig
   ```
3. Look for the **IPv4 Address** under your network adapter — usually starts with `192.168.` or `10.`. Example: `192.168.1.50`.

### On Ubuntu / Linux
```
ip -4 addr show | grep inet
```
Pick the address starting with `192.168.` or `10.`.

**Write this IP down** — you'll need it in the next step.

---

## Step 3 — Configure RT Connect (3 minutes)

Inside the `deploy_packages` folder there is a file called `.env.example`. You're going to make a copy of it called `.env` and edit a few values.

### On Windows
1. Open the `deploy_packages` folder in File Explorer.
2. Find `.env.example`. Right-click → **Copy**.
3. Paste in the same folder. Rename the copy to **`.env`** (no extension, no `.txt`).
   > *If Windows hides extensions, enable "View → File name extensions" first.*
4. Right-click `.env` → **Open with Notepad**.

### On Linux
```
cp .env.example .env
nano .env
```

### What to edit

Edit these 3 lines. Save the file when done.

```
SERVER_IP=192.168.1.50           ← put YOUR server IP here

ALLOWED_ORIGINS=https://192.168.1.50,http://192.168.1.50   ← same IP

DB_PASSWORD=ChangeThisToAStrongPassword123!   ← invent a strong password
```

> **Don't change anything else** unless you have a reason to. Defaults are fine.

---

## Step 4 — Start RT Connect (one command, ~5 minutes the first time)

On the server, navigate into the `deploy_packages` folder and run the start script.

### On Windows
- Double-click **`start.bat`**.

A black window opens, downloads images, builds the app, and starts everything. The first run takes 3–5 minutes (it's downloading dependencies). Subsequent starts take 10 seconds.

When you see:
```
========================================
  Stack is up
========================================
```
…you're done.

### On Linux
```bash
chmod +x *.sh
./start.sh
```

---

## Step 5 — Open the app from any computer in the office

In any web browser on any computer (or phone) on the same network:

```
https://<your-server-ip>
```

Example: `https://192.168.1.50`

### About the "Not secure" warning

Because RT Connect uses a self-signed certificate (no public domain involved), browsers will show a warning the first time:

> "Your connection is not private" / "Avertissement de risque potentiel"

This is **expected and safe** on a closed local network. Two ways to handle it:

**Option A — Quick (good enough for demos):**
Click **"Advanced"** → **"Proceed to 192.168.1.50 (unsafe)"**. The browser remembers and won't ask again on this computer.

**Option B — Permanent (production):**
Run the certificate install once on each client computer (10 seconds per machine):

1. On the **server**, run:
   - Windows: double-click `extract-ca.bat`
   - Linux: `./extract-ca.sh`

2. A file called **`rtconnect-ca.crt`** appears in the `deploy_packages` folder.

3. Copy that file to each client computer (USB stick, network share, email — anything).

4. On each client:
   - **Windows**: double-click `rtconnect-ca.crt` → **Install Certificate** → **Local Machine** → choose **Place all certificates in the following store** → **Browse** → select **Trusted Root Certification Authorities** → Next → Finish.
   - **macOS**: double-click → opens Keychain Access → drag to **System** keychain → double-click the cert → **Trust** section → set **When using this certificate: Always Trust**.
   - **Linux**: `sudo cp rtconnect-ca.crt /usr/local/share/ca-certificates/ && sudo update-ca-certificates`
   - **Android**: Settings → Security → Encryption & credentials → Install a certificate → CA certificate.

5. **Restart the browser** on the client. The warning is gone, padlock is green.

---

## Step 6 — First login

Default account:

| User  | Password   |
|-------|------------|
| admin | admin123   |

**Change this password right after your first login** (top-right profile menu).

---

## Day-to-day: what to do when…

| Situation | What to do |
|-----------|------------|
| The server was rebooted | Open Docker Desktop. Then double-click `start.bat`. RT Connect starts again. Or set "Start Docker Desktop when you log in" in Docker settings. |
| You want to stop RT Connect | Double-click `stop.bat` |
| Something looks broken | Double-click `logs.bat` to watch what's happening. Take a screenshot if you need to ask for help. |
| You want a backup | Double-click `backup.bat`. A `.sql.gz` file appears in `deploy_packages\backups\`. Copy it to a safe place. |
| You need to restore a backup | `restore.bat backups\<filename>.sql.gz` |
| The IP address of the server changed | Edit `.env` (update `SERVER_IP` and `ALLOWED_ORIGINS`). Then double-click `stop.bat`, then `start.bat`. Re-extract the CA cert and reinstall on clients (the cert is tied to the IP). |
| You updated the code on your dev PC | On the dev PC: `build.bat` then `start.bat`. To ship to a client: zip the whole `deploy_packages` folder. |

---

## Frequently asked questions

**Q: Does this need internet to run?**
A: Only the **first time** (to download Docker images and Node/Python packages during build). After that it runs offline.

**Q: Where does my data live?**
A: Inside Docker, in a named volume called `postgres_data`. It survives stop/start. To back it up: use `backup.bat`.

**Q: What happens if the power cuts out?**
A: Docker auto-restarts every container when the machine boots back up (we set `restart: unless-stopped`). Just make sure Docker Desktop is set to start at login.

**Q: Can I use this in production for a real client?**
A: Yes. Set a strong `DB_PASSWORD`, install the CA cert on client machines (Step 5 / Option B), and schedule nightly `backup.bat` (Windows Task Scheduler) or `backup.sh` (cron on Linux).

**Q: Why not Let's Encrypt?**
A: Let's Encrypt requires a public domain name and either internet-facing reachability or a public DNS record. A LAN-only office system has neither. Caddy's `tls internal` is the LAN-friendly equivalent.

**Q: I got a different error, what do I do?**
A: Run `logs.bat` (or `./logs.sh`), copy the last 50 lines, send them to whoever supports your installation. The error is almost always in there.

---

## Cheat-sheet (one screen reference)

```
┌─────────────────────────────────────────────────────────────────────┐
│  FIRST TIME                                                         │
│    1. Install Docker Desktop                                        │
│    2. Find server IP (ipconfig)                                     │
│    3. Copy .env.example to .env, edit SERVER_IP, ALLOWED_ORIGINS,   │
│       DB_PASSWORD                                                   │
│    4. Double-click start.bat (5 min wait first time)                │
│    5. Open https://<server-ip> in browser                           │
│    6. Optional: extract-ca.bat → install cert on each client        │
│    7. Login: admin / admin123, change password                      │
│                                                                     │
│  EVERY DAY                                                          │
│    - It's just running. Nothing to do.                              │
│                                                                     │
│  TROUBLE                                                            │
│    - logs.bat        see what's happening                           │
│    - stop.bat        stop everything                                │
│    - start.bat       start again                                    │
│    - backup.bat      make a backup                                  │
└─────────────────────────────────────────────────────────────────────┘
```
