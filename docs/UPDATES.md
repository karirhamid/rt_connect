# RTPointage — Update / Upgrade System

How a change made in local dev becomes a controlled, validated update applied
on the production VM — from **Paramètres → Mise à jour** (super-admin only).

Status: **design + checklist (this doc).** Implementation is phased — see
"Build phases" at the bottom.

---

## 1. The update package (`.rtu` / shown as `.bin`)

A single signed file produced in dev by a builder script. It is a `tar.gz`
(renamed to `.rtu`) containing:

```
manifest.json          # version, min_from, changelog, requirements, checksums
backend/               # full backend-api source snapshot
frontend/              # full frontend source snapshot
SHA256SUMS             # checksum of every file
signature              # HMAC/RSA signature of manifest.json + SHA256SUMS
```

`manifest.json` example:

```json
{
  "version": "2.2.0",
  "min_from_version": "2.1.0",
  "built_at": "2026-05-25T10:00:00Z",
  "changelog": {
    "features": ["Merged/by-device Today view", "Second-precise gap-fill sync"],
    "fixes": ["Absent excludes scheduled day-off", "Audit log permission + anonyme noise"],
    "breaking": []
  },
  "requires": {
    "min_postgres_major": 16,
    "new_python_deps": ["tzdata==2024.1"],
    "new_env_vars": [],
    "migrations": true
  }
}
```

The version comes from `APP_VERSION` in `.env` / docker-compose.

---

## 2. Pre-flight checks (shown like a test, must pass / be confirmed)

When a super-admin uploads a package, the server validates BEFORE anything is
applied and shows a pass/warn/fail list. Tailored to this project:

| Check | Why | Severity if bad |
|-------|-----|-----------------|
| **Package signature + SHA256** | the file wasn't tampered/corrupted | FAIL (block) |
| **Version**: pkg.version > current AND current ≥ min_from_version | no downgrade / skipping incompatible jumps | FAIL |
| **Not already applied** | idempotency | WARN |
| **Docker available** + compose project found | needed to rebuild/restart | FAIL |
| **Disk free ≥ ~2 GB** | image rebuild + DB backup need room | FAIL |
| **Database reachable** (DB_HOST/PORT/USER from .env) | migrations + app need it | FAIL |
| **PostgreSQL major ≥ min_postgres_major (16)** | schema compatibility | FAIL |
| **Pending migrations preview** | show which ALTER/CREATE will run | INFO |
| **New python deps installable** (pip dry-run in a throwaway) | build won't fail mid-way | WARN/FAIL |
| **New required env vars present** in .env | app won't boot missing config | FAIL |
| **Ports**: 80/443 owned by our Caddy, 5432/8000 internal reachable | no conflict after restart | WARN |
| **Fresh DB backup just taken** | safe rollback point | FAIL if backup fails |
| **Caddy/nginx config still valid** | proxy starts after restart | WARN |

The UI shows: version from→to, the **changelog** (features / fixes / breaking),
the preflight table, and a **Confirm & Apply** button enabled only when no FAIL
remains.

---

## 3. Apply sequence (server-orchestrated, with rollback)

1. **Backup**: `pg_dump --format=custom` of the DB (existing Maintenance backup).
2. **Stage**: extract package to `/opt/rt_connect/updates/<version>/`.
3. **Swap source** into the build contexts (what `build.sh` does).
4. **Rebuild**: `docker compose build backend frontend`.
5. **Restart**: `docker compose up -d` (only changed services recreate).
6. **Migrations**: run automatically on backend startup (idempotent ALTERs).
7. **Health check**: poll `/health` for ~60 s.
8. **Rollback on failure**: restore previous source + previous images + DB
   backup, `up -d`, and report the error.

> Whichever component runs steps 3–7 is the architecture decision (see top of
> file): host-side updater service vs. docker-socket vs. guided command.

---

## 4. Security

- **Super-admin only** (`roles.manage`); endpoint + page both gated.
- Package **signed** with a key that lives only in dev; prod verifies with the
  public half. A random `.bin` can't be applied.
- Every upload/apply/rollback is written to the **admin audit log**.
- Applied packages are archived under `/opt/rt_connect/updates/` for audit.

---

## 5. Changelog convention (fill this every release)

Keep a running list here; the builder reads the latest entry into the manifest.

### vX.Y.Z — YYYY-MM-DD
- **Features:** …
- **Fixes:** …
- **Breaking / manual steps:** … (e.g. "set NEW_ENV_VAR in .env")
- **Migrations:** yes/no (what columns/tables)
- **New deps:** …

---

### v2.2.0 — 2026-05-25 (example, current main)
- **Features:** merged/by-device Today view + single all-devices sync;
  second-precise gap-fill with per-device from→to; employee portal; anomaly
  inbox; payroll exports; manual-punch approval workflow.
- **Fixes:** absent excludes scheduled day-off; audit-log permission + anonyme
  noise; punch device-attribution; report/email count consistency.
- **Migrations:** yes (approved/approved_by/approved_at, reports.hours perm,
  portal columns, source/voided columns, anomalies/corrections/audit tables).
- **New deps:** openpyxl, tzdata.

---

## 6. Build phases

1. **Manifest + builder** (dev CLI: `make_update.py` → `.rtu`) + this doc. ✅ doc
2. **Upload + preflight (read-only)**: super-admin uploads, server validates
   and shows the table + changelog. No apply yet — safe to ship first.
3. **Apply + rollback** via the chosen host mechanism.
4. **History page**: list of applied updates, who/when, rollback button.
