-- Employee self-service portal — Postgres role with least-privilege grants.
-- Run this as a superuser (or any role with CREATEROLE + GRANT privileges).
--
-- The backend will create + sync this role automatically on startup when
-- PORTAL_DB_USER + PORTAL_DB_PASSWORD env vars are set. Use this script
-- only if your admin DB user lacks CREATEROLE.

-- 1) Pick a strong random password and replace the placeholder below.
--    Generate one with: openssl rand -base64 24
\set portal_user 'portal_user'
\set portal_pwd  'CHANGE-ME-STRONG-RANDOM-PASSWORD'

-- 2) Create role
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'portal_user') THEN
    EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT',
                   :'portal_user', :'portal_pwd');
  ELSE
    EXECUTE format('ALTER ROLE %I WITH LOGIN PASSWORD %L', :'portal_user', :'portal_pwd');
  END IF;
END $$;

-- 3) Allow connect + schema usage
GRANT CONNECT ON DATABASE current_database() TO :"portal_user";
GRANT USAGE   ON SCHEMA public                TO :"portal_user";

-- 4) Clean slate
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM :"portal_user";
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM :"portal_user";

-- 5) Grant the minimum:
GRANT SELECT ON employees, attendance, departments, app_settings, daily_shift_records, devices TO :"portal_user";

-- Column-level UPDATE for password change ONLY:
GRANT UPDATE (portal_pin_hash, portal_must_change_password) ON employees TO :"portal_user";

-- 6) Default for future tables = no access:
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM :"portal_user";

-- 7) Set the env vars on the backend:
--      PORTAL_DB_USER=portal_user
--      PORTAL_DB_PASSWORD=<same password as above>
--    Then restart the backend.

-- Verify:
--   SELECT rolname, rolsuper FROM pg_roles WHERE rolname = 'portal_user';
--   SELECT table_name, privilege_type FROM information_schema.role_table_grants
--     WHERE grantee = 'portal_user' ORDER BY table_name;
