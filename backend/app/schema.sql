-- PostgreSQL 16+; initial schema. Applied transactionally by manage init/migrate.
CREATE TABLE IF NOT EXISTS metadata (
    id integer PRIMARY KEY CHECK (id=1),
    revision bigint NOT NULL DEFAULT 0,
    schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version=1)
);
INSERT INTO metadata(id,revision) VALUES(1,0) ON CONFLICT(id) DO NOTHING;
-- JSONB documents retain the React contract. Each half-month is one atomic aggregate.
CREATE TABLE IF NOT EXISTS floors (id text PRIMARY KEY, data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS employees (id text PRIMARY KEY, data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS periods (id text PRIMARY KEY, data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS accounts (
    login text PRIMARY KEY,
    password_hash text NOT NULL,
    role text NOT NULL CHECK(role IN ('admin','employee')),
    employee_id text UNIQUE REFERENCES employees(id),
    CHECK((role='admin' AND employee_id IS NULL) OR (role='employee' AND employee_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS one_admin ON accounts(role) WHERE role='admin';
CREATE TABLE IF NOT EXISTS sessions (
    token_hash text PRIMARY KEY,
    csrf text NOT NULL,
    login text REFERENCES accounts(login) ON DELETE CASCADE,
    expires double precision NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires);
CREATE TABLE IF NOT EXISTS login_attempts (
    key text PRIMARY KEY,
    count integer NOT NULL,
    expires double precision NOT NULL
);
