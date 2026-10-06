"""Run: uvicorn app.main:app --host 127.0.0.1 --port 8000"""

import os
import psycopg
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated
from fastapi import FastAPI, Request, Response, Query
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware
from . import auth, db
from .models import Command, Login
from .service import RuleError, apply, project


def create_app(database=None, *, secure_cookie=None, allowed_origins=None):
    try:
        database = database or db.database_url()
    except RuntimeError:
        database = None
    secure = (
        os.getenv("SHIFT_SECURE_COOKIE", "false").lower() == "true"
        if secure_cookie is None
        else secure_cookie
    )
    origins = allowed_origins or os.getenv(
        "SHIFT_ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,http://127.0.0.1:8000",
    ).split(",")

    @asynccontextmanager
    async def lifespan(app):
        if not database:
            raise RuntimeError(
                "DATABASE_URLを設定してください。backend/.env.exampleを参照してください。"
            )
        with db.transaction(database) as con:
            db.revision(con)  # Fail clearly if manage init/migrate has not been run.
        yield

    api = FastAPI(title="Floor Shift API", version="1.0.0", lifespan=lifespan)
    api.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=os.getenv(
            "SHIFT_ALLOWED_HOSTS", "localhost,127.0.0.1,testserver"
        ).split(","),
    )

    @api.middleware("http")
    async def guard(request, call_next):
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            origin = request.headers.get("origin")
            if origin and origin not in origins:
                return JSONResponse(
                    {"message": "許可されていない接続元です。"}, status_code=403
                )
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @api.exception_handler(RuleError)
    async def rule_error(request, exc):
        return JSONResponse({"message": str(exc)}, status_code=exc.status)

    @api.exception_handler(RequestValidationError)
    async def input_error(request, exc):
        # Do not echo credentials or whole submitted rows into errors.
        return JSONResponse(
            {
                "message": "入力形式が不正です。日時・必須項目・文字数を確認してください。",
                "fields": [".".join(map(str, e["loc"])) for e in exc.errors()],
            },
            status_code=422,
        )

    @api.exception_handler(psycopg.OperationalError)
    async def database_error(request, exc):
        return JSONResponse(
            {
                "message": "保存処理が混み合っています。再読み込みして再試行してください。"
            },
            status_code=503,
        )

    @api.get("/api/health")
    def health():
        return {"status": "ok"}

    @api.get("/api/session")
    def session(request: Request, response: Response):
        with db.transaction(database, write=True) as con:
            token = request.cookies.get(auth.COOKIE)
            s = auth.find_session(con, token)
            if s:
                return {"session": auth.session_user(con, s), "csrfToken": s["csrf"]}
            csrf = auth.new_session(con, response, secure, old_token=token)
            return {"session": None, "csrfToken": csrf}

    @api.post("/api/session/login")
    def login(body: Login, request: Request, response: Response):
        with db.transaction(database, write=True) as con:
            auth.require_session(con, request, csrf=True, authenticated=False)
            keys = auth.throttle_keys(request, body.id)
            if auth.is_throttled(con, keys):
                return JSONResponse(
                    {
                        "message": "ログイン試行が多すぎます。15分後に再試行してください。"
                    },
                    status_code=429,
                )
            account = con.execute(
                "SELECT * FROM accounts WHERE login=%s", (body.id,)
            ).fetchone()
            ok = auth.verify_password(
                account["password_hash"] if account else None, body.password
            )
            if not account or not ok:
                auth.record_failure(con, keys)
                return JSONResponse(
                    {"message": "ログインIDまたはパスワードが違います。"},
                    status_code=401,
                )
            con.execute("DELETE FROM login_attempts WHERE key=%s", (keys[1],))
            csrf = auth.new_session(
                con,
                response,
                secure,
                login=body.id,
                old_token=request.cookies.get(auth.COOKIE),
            )
            user = auth.session_user(con, {"login": body.id})
            return {"session": user, "csrfToken": csrf}

    @api.post("/api/session/logout")
    def logout(request: Request, response: Response):
        with db.transaction(database, write=True) as con:
            auth.require_session(con, request, csrf=True)
            csrf = auth.new_session(
                con, response, secure, old_token=request.cookies.get(auth.COOKIE)
            )
            return {"session": None, "csrfToken": csrf}

    @api.get("/api/workspace")
    def workspace(request: Request, period: Annotated[str, Query(max_length=10)]):
        with db.transaction(database) as con:
            _, user = auth.require_session(con, request)
            state = db.load(con, period)
            return project(state, user, db.revision(con))

    @api.post("/api/commands")
    def command(body: Command, request: Request):
        with db.transaction(database, write=True) as con:
            _, user = auth.require_session(con, request, csrf=True)
            if db.revision(con) != body.expectedRevision:
                raise RuleError(
                    "別の画面でデータが更新されています。「再読み込み」してから操作し直してください。",
                    409,
                )
            state = db.load(con, body.period)
            apply(state, user, body.model_dump())
            db.save(con, state)
            return {"ok": True, "revision": db.revision(con)}

    return api


app = create_app()
