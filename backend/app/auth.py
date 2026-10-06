"""Opaque, revocable sessions and Argon2 password hashes."""

import hashlib
import re
import secrets
import time
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, InvalidHashError
from .service import RuleError

HASHER = PasswordHasher()
DUMMY_HASH = HASHER.hash(secrets.token_urlsafe(32))
COOKIE = "floor_shift_session"


def digest(token):
    return hashlib.sha256(token.encode()).hexdigest()


def create_account(con, login, password, role, employee_id=None):
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,128}", login):
        raise RuleError(
            "ログインIDは英数字・ハイフン・アンダースコア・ピリオドで指定してください。"
        )
    if not 12 <= len(password) <= 256:
        raise RuleError("パスワードは12〜256文字にしてください。")
    if role not in ("admin", "employee") or (role == "employee" and not employee_id):
        raise RuleError("アカウント種別と従業員IDを確認してください。")
    con.execute(
        "INSERT INTO accounts(login,password_hash,role,employee_id) VALUES(%s,%s,%s,%s)",
        (login, HASHER.hash(password), role, employee_id),
    )


def verify_password(encoded, password):
    try:
        return HASHER.verify(encoded or DUMMY_HASH, password)
    except (VerificationError, InvalidHashError):
        return False


def find_session(con, token):
    if not token or len(token) > 128:
        return None
    return con.execute(
        "SELECT * FROM sessions WHERE token_hash=%s AND expires>%s",
        (digest(token), time.time()),
    ).fetchone()


def new_session(con, response, secure, login=None, old_token=None):
    now = time.time()
    con.execute("DELETE FROM sessions WHERE expires<=%s", (now,))
    if old_token:
        con.execute("DELETE FROM sessions WHERE token_hash=%s", (digest(old_token),))
    token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    lifetime = 8 * 3600 if login else 1800
    con.execute(
        "INSERT INTO sessions VALUES(%s,%s,%s,%s)",
        (digest(token), csrf, login, now + lifetime),
    )
    response.set_cookie(
        COOKIE,
        token,
        max_age=lifetime,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/api",
    )
    return csrf


def session_user(con, session):
    if session is None or not session["login"]:
        return None
    account = con.execute(
        "SELECT login,role,employee_id FROM accounts WHERE login=%s",
        (session["login"],),
    ).fetchone()
    if account is None:
        return None
    if account["role"] == "admin":
        return {"role": "admin", "name": "管理者"}
    import json

    row = con.execute(
        "SELECT data FROM employees WHERE id=%s", (account["employee_id"],)
    ).fetchone()
    if not row:
        return None
    employee = row["data"]
    return {"role": "employee", "name": employee["name"], "employeeId": employee["id"]}


def require_session(con, request, *, csrf=False, authenticated=True):
    session = find_session(con, request.cookies.get(COOKIE))
    if session is None:
        raise RuleError("ログイン画面を再読み込みしてください。", 401)
    if csrf and not secrets.compare_digest(
        session["csrf"], request.headers.get("X-CSRF-TOKEN", "")
    ):
        raise RuleError("画面を再読み込みしてから操作してください。", 403)
    user = session_user(con, session)
    if authenticated and user is None:
        raise RuleError("ログインしてください。", 401)
    return session, user


def throttle_keys(request, login):
    ip = request.client.host if request.client else "unknown"
    return ["ip:" + digest(ip), "login:" + digest(login)]


def is_throttled(con, keys):
    now = time.time()
    con.execute("DELETE FROM login_attempts WHERE expires<=%s", (now,))
    return any(
        (
            row := con.execute(
                "SELECT count FROM login_attempts WHERE key=%s", (key,)
            ).fetchone()
        )
        and row["count"] >= (50 if key.startswith("ip:") else 10)
        for key in keys
    )


def record_failure(con, keys):
    for key in keys:
        con.execute(
            "INSERT INTO login_attempts VALUES(%s,1,%s) ON CONFLICT(key) DO UPDATE SET count=login_attempts.count+1",
            (key, time.time() + 900),
        )
