# RT Connect — Deployment Guide (Ubuntu 22.04)

## Overview

RT Connect is deployed as:
- **Frontend** — static HTML/JS/CSS served by Nginx from `/opt/rtconnect/frontend/`
- **Backend** — FastAPI app running under Uvicorn on port 8000, proxied by Nginx
- **Database** — PostgreSQL 14+ with database `rtzkconnect_db`
- **Process manager** — systemd service `rtconnect-api`

---

## Step 1 — Build the package (Windows)

Run `build_package.bat` from the project root on your development machine:

```
build_package.bat
```

You will be prompted for:
- **Server IP or domain** — the public address of your Ubuntu server (e.g. `192.168.1.100`)
- **Dump local database?** — yes to bundle the current database into the package

The script produces `rtconnect_v2_YYYYMMDD.zip`.

---

## Step 2 — Transfer to the server

```bash
scp rtconnect_v2_YYYYMMDD.zip your_user@SERVER_IP:~
```

---

## Step 3 — Extract and install

```bash
ssh your_user@SERVER_IP
unzip rtconnect_v2_YYYYMMDD.zip -d rtconnect_package
cd rtconnect_package
sudo bash deploy/install.sh
```

The install script will:
1. Install system packages (Python 3.11, PostgreSQL, Nginx, ufw, fail2ban)
2. Create a dedicated `rtconnect` service user
3. Copy files to `/opt/rtconnect/`
4. Create a Python virtual environment and install dependencies
5. Create the PostgreSQL user and database
6. Optionally restore a DB dump
7. Write `/opt/rtconnect/backend/.env`
8. Install and start the `rtconnect-api` systemd service
9. Configure and start Nginx
10. Enable the ufw firewall (SSH + HTTP/HTTPS)

---

## Step 4 — First login

Navigate to `http://YOUR_SERVER_IP` in a browser.

Default credentials:
| Username | Password  |
|----------|-----------|
| admin    | admin123  |

**Change the admin password immediately after first login.**

---

## Useful commands

| Task | Command |
|------|---------|
| View API logs | `journalctl -u rtconnect-api -f` |
| Restart API | `sudo systemctl restart rtconnect-api` |
| Restart Nginx | `sudo systemctl restart nginx` |
| Manual DB backup | `sudo bash /opt/rtconnect/deploy/backup_db.sh` |
| Restore a backup | `sudo bash /opt/rtconnect/deploy/restore_db.sh /opt/rtconnect/backups/rtzkconnect_db_TIMESTAMP.sql.gz` |
| Nginx config test | `sudo nginx -t` |

---

## Scheduled DB backups (optional)

Add a daily cron job as root:

```bash
sudo crontab -e
```

Add this line to run at 02:00 every day:
```
0 2 * * * bash /opt/rtconnect/deploy/backup_db.sh >> /opt/rtconnect/logs/backup.log 2>&1
```

Backups are stored in `/opt/rtconnect/backups/` and automatically pruned after 30 days.

---

## Updating the application

1. Build a new package with `build_package.bat` (skip DB dump unless migrating)
2. Transfer the zip and extract it
3. Stop the service: `sudo systemctl stop rtconnect-api`
4. Rsync the new files:
   ```bash
   sudo rsync -a --exclude='__pycache__' --exclude='*.pyc' --exclude='venv' \
       rtconnect_package/backend/ /opt/rtconnect/backend/
   sudo rsync -a rtconnect_package/frontend/ /opt/rtconnect/frontend/
   ```
5. Re-install Python dependencies if `requirements.txt` changed:
   ```bash
   sudo -u rtconnect /opt/rtconnect/backend/venv/bin/pip install -r /opt/rtconnect/backend/requirements.txt
   ```
6. Start the service: `sudo systemctl start rtconnect-api`

---

## File layout on the server

```
/opt/rtconnect/
├── backend/          # FastAPI application
│   ├── .env          # Production secrets (chmod 600)
│   ├── venv/         # Python virtual environment
│   └── main.py
├── frontend/         # Built React SPA (served by Nginx)
│   └── index.html
├── backups/          # PostgreSQL backup dumps
├── logs/             # Application and backup logs
└── deploy/           # This directory (scripts)
    ├── install.sh
    ├── backup_db.sh
    ├── restore_db.sh
    ├── rtconnect-api.service
    └── nginx.conf
```
