#!/bin/sh
set -eu
# Runs once on a new PostgreSQL volume. Never echo the password or enable SQL logging.
APP_PASSWORD=$(cat /run/secrets/app_db_password)
export APP_PASSWORD
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1 <<'SQL'
\getenv app_password APP_PASSWORD
SELECT format('CREATE ROLE calirestore_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD %L', :'app_password') \gexec
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL
unset APP_PASSWORD
