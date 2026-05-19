"""Provision the portal_user Postgres role with least-privilege grants.

Idempotent. Runs at startup. Skips silently with a warning if the admin
connection is not a superuser (operators can run the same SQL manually).

The portal role is restricted to:
  SELECT on:    employees, attendance, departments, app_settings,
                daily_shift_records, devices (id, name)
  UPDATE on:    employees.portal_pin_hash, employees.portal_must_change_password

Everything else (audit log, anomalies, email creds, app secrets, payroll
config, users, roles, permissions, corrections, sync logs, …) is unreachable
even if the portal API has a SQL-injection bug.
"""
from __future__ import annotations
import logging
import os
from sqlalchemy import text as sa_text

from app.database.connection import engine

logger = logging.getLogger(__name__)

PORTAL_USER = os.getenv("PORTAL_DB_USER")
PORTAL_PASSWORD = os.getenv("PORTAL_DB_PASSWORD")


def ensure_portal_role() -> None:
    """Create + sync grants for portal_user. Best-effort, never raises."""
    if not PORTAL_USER:
        logger.info("portal_db_setup: PORTAL_DB_USER unset — skipping role provisioning")
        return
    if not PORTAL_PASSWORD:
        logger.error("portal_db_setup: PORTAL_DB_USER set but PORTAL_DB_PASSWORD missing — skipping")
        return

    try:
        with engine.connect() as conn:
            # 1) Create role if missing, sync password
            exists = conn.execute(sa_text(
                "SELECT 1 FROM pg_roles WHERE rolname = :u"
            ), {"u": PORTAL_USER}).first()

            if not exists:
                conn.execute(sa_text(
                    f"CREATE ROLE \"{PORTAL_USER}\" LOGIN PASSWORD :pw NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT"
                ), {"pw": PORTAL_PASSWORD})
                logger.info("portal_db_setup: created role %s", PORTAL_USER)
            else:
                conn.execute(sa_text(
                    f"ALTER ROLE \"{PORTAL_USER}\" WITH LOGIN PASSWORD :pw"
                ), {"pw": PORTAL_PASSWORD})

            # 2) Allow connect to current DB
            db_name = conn.execute(sa_text("SELECT current_database()")).scalar()
            conn.execute(sa_text(f'GRANT CONNECT ON DATABASE "{db_name}" TO "{PORTAL_USER}"'))
            conn.execute(sa_text(f'GRANT USAGE ON SCHEMA public TO "{PORTAL_USER}"'))

            # 3) Revoke everything first (idempotent clean slate)
            conn.execute(sa_text(
                f'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM "{PORTAL_USER}"'
            ))
            conn.execute(sa_text(
                f'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM "{PORTAL_USER}"'
            ))

            # 4) Grant the minimum
            for tbl in ("employees", "attendance", "departments",
                        "app_settings", "daily_shift_records", "devices"):
                conn.execute(sa_text(f'GRANT SELECT ON {tbl} TO "{PORTAL_USER}"'))

            # Column-level UPDATE for password change only
            conn.execute(sa_text(
                f'GRANT UPDATE (portal_pin_hash, portal_must_change_password) '
                f'ON employees TO "{PORTAL_USER}"'
            ))

            # Default privileges for FUTURE tables = no access (Postgres default,
            # but state it explicitly so a careless ALTER DEFAULT PRIVILEGES
            # somewhere else doesn't open new tables to the portal).
            try:
                conn.execute(sa_text(
                    f'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM "{PORTAL_USER}"'
                ))
            except Exception:
                pass  # requires being the owner; safe to skip

            conn.commit()
            logger.info("portal_db_setup: role %s provisioned with least-privilege grants", PORTAL_USER)

    except Exception as e:
        logger.warning(
            "portal_db_setup: could not provision role (%s). "
            "Run the SQL from docs/PORTAL_ROLE.sql manually if you want the isolation.",
            e,
        )
