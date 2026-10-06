"""PostgreSQL persistence using psycopg 3. No SQLite fallback."""

import os
from contextlib import contextmanager
from pathlib import Path
import psycopg
from psycopg.rows import dict_row
from psycopg.conninfo import make_conninfo
from psycopg.types.json import Jsonb
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
LOCK_ID = 734118219


def database_url():
    value = os.getenv("DATABASE_URL")
    if value:
        return value
    if not all(os.getenv(k) for k in ("PGHOST", "PGDATABASE", "PGUSER")):
        raise RuntimeError("PostgreSQLの接続設定をbackend/.envに記載してください。")
    return make_conninfo(
        host=os.environ["PGHOST"],
        port=os.getenv("PGPORT", "5432"),
        dbname=os.environ["PGDATABASE"],
        user=os.environ["PGUSER"],
        password=os.getenv("PGPASSWORD", ""),
    )


def connect(url):
    con = psycopg.connect(
        url, row_factory=dict_row, connect_timeout=10, prepare_threshold=None
    )
    con.execute("SET statement_timeout = '15s'")
    con.execute("SET lock_timeout = '10s'")
    return con


@contextmanager
def transaction(url, *, write=False):
    with connect(url) as con:
        if write:
            # One writer across all API workers. Check revision only after acquiring the lock.
            con.execute("SELECT pg_advisory_xact_lock(%s)", (LOCK_ID,))
        else:
            # Every workspace field and revision comes from the same snapshot.
            con.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        yield con
        # psycopg context manager commits on success, rolls back on any exception and closes.


def initialize(url):
    with connect(url) as con:
        con.execute("SELECT pg_advisory_xact_lock(%s)", (LOCK_ID,))
        con.execute(Path(__file__).with_name("schema.sql").read_text())


def revision(con):
    return con.execute("SELECT revision FROM metadata WHERE id=1").fetchone()[
        "revision"
    ]


def documents(con, table):
    assert table in ("floors", "employees")
    return [r["data"] for r in con.execute(f"SELECT data FROM {table} ORDER BY id")]


def put(con, table, data):
    assert table in ("floors", "employees", "periods")
    con.execute(
        f"INSERT INTO {table}(id,data) VALUES(%s,%s) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
        (data["id"], Jsonb(data)),
    )


def load(con, period):
    from .service import make_period

    period_meta = make_period(period)
    result = con.execute("SELECT data FROM periods WHERE id=%s", (period,)).fetchone()
    bucket = (
        result["data"]
        if result
        else {"id": period, "period": period_meta, "submissions": [], "shifts": []}
    )
    return {
        "floors": documents(con, "floors"),
        "employees": documents(con, "employees"),
        **bucket,
    }


def save(con, state):
    for f in state["floors"]:
        put(con, "floors", f)
    for e in state["employees"]:
        put(con, "employees", e)
    put(
        con, "periods", {k: state[k] for k in ("id", "period", "submissions", "shifts")}
    )
    con.execute("UPDATE metadata SET revision=revision+1 WHERE id=1")
