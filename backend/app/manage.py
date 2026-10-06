"""Local account administration; passwords are read using getpass, never command arguments."""

import argparse
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from getpass import getpass
import json
import psycopg
from . import auth, db
from .service import RuleError, make_period

COLORS = ["#236b59", "#3269b0", "#9165b5", "#b97932", "#b75272"]


def password():
    first = getpass("パスワード（12文字以上）: ")
    if first != getpass("パスワード（確認）: "):
        raise RuleError("パスワードが一致しません。")
    if not 12 <= len(first) <= 256:
        raise RuleError("パスワードは12〜256文字にしてください。")
    return first


def seed(con, samples=False):
    floors = [
        {"id": f"f{i + 1}", "name": f"{i + 1}F " + name, "color": COLORS[i]}
        for i, name in enumerate(
            ["ホール", "ダイニング", "ラウンジ", "イベント", "テラス"]
        )
    ]
    for floor in floors:
        db.put(con, "floors", floor)
    if not samples:
        return
    surnames = [
        "田中",
        "佐藤",
        "鈴木",
        "高橋",
        "伊藤",
        "渡辺",
        "山本",
        "中村",
        "小林",
        "加藤",
    ]
    employees = [
        {
            "id": f"e{i + 1}",
            "name": f"{surnames[i % 10]} "
            + ["葵", "悠", "陽菜", "蓮", "結衣"][i // 10],
            "floorIds": [f"f{i // 10 + 1}"]
            + ([f"f{(i // 10 + 1) % 5 + 1}"] if i % 10 == 0 else []),
        }
        for i in range(50)
    ]
    for employee in employees:
        db.put(con, "employees", employee)
    now = datetime.now(ZoneInfo("Asia/Tokyo"))
    first = now.date().replace(day=1 if now.day <= 15 else 16)
    next_day = (
        first.replace(day=16)
        if first.day == 1
        else (first.replace(day=28) + timedelta(days=4)).replace(day=1)
    )
    for start, closed in [(first, True), (next_day, False)]:
        period = make_period(start.isoformat())
        period["deadline"] = (now + timedelta(days=-1 if closed else 5)).isoformat()
        bucket = {"id": period["id"], "period": period, "submissions": [], "shifts": []}
        for i, e in enumerate(employees[:35]):
            rows = [
                {
                    "id": f"r-{e['id']}-{j}",
                    "date": (start + timedelta(days=j * 2)).isoformat(),
                    "start": "09:00" if i % 2 == 0 else "12:00",
                    "end": "15:00" if i % 2 == 0 else "18:00",
                    "floorId": e["floorIds"][0],
                    "note": "",
                }
                for j in range(3)
            ]
            bucket["submissions"].append(
                {
                    "employeeId": e["id"],
                    "draftRows": rows,
                    "draftNote": "",
                    "submittedRows": rows,
                    "submittedNote": "",
                    "submittedAt": now.isoformat(),
                    "dirty": False,
                }
            )
            bucket["shifts"] += [
                {
                    **r,
                    "id": f"s-{e['id']}-{j}",
                    "employeeId": e["id"],
                    "status": "pending",
                    "original": r,
                }
                for j, r in enumerate(rows)
            ]
        db.put(con, "periods", bucket)


def main():
    parser = argparse.ArgumentParser(description="Floor Shift アカウント管理")
    sub = parser.add_subparsers(dest="command", required=True)
    init = sub.add_parser("init")
    init.add_argument("--login", default="admin")
    init.add_argument("--sample-data", action="store_true")
    create = sub.add_parser("create-user")
    create.add_argument("--login", required=True)
    create.add_argument("--employee-id", required=True)
    reset = sub.add_parser("reset-password")
    reset.add_argument("--login", required=True)
    sub.add_parser("list-employees")
    sub.add_parser("migrate")
    args = parser.parse_args()
    path = db.database_url()
    db.initialize(path)
    try:
        if args.command == "migrate":
            print("スキーマの初期化が完了しました。")
            return
        if args.command == "list-employees":
            with db.transaction(path) as con:
                for e in db.documents(con, "employees"):
                    print(e["id"], e["name"])
            return
        print("パスワードは画面に表示されません。")
        secret = password()
        with db.transaction(path, write=True) as con:
            if args.command == "init":
                if (
                    con.execute("SELECT 1 FROM accounts LIMIT 1").fetchone()
                    or con.execute("SELECT 1 FROM floors LIMIT 1").fetchone()
                ):
                    raise RuleError("初期化済みです。既存データは変更しません。")
                seed(con, args.sample_data)
                auth.create_account(con, args.login, secret, "admin")
            elif args.command == "create-user":
                auth.create_account(
                    con, args.login, secret, "employee", args.employee_id
                )
            else:
                if not con.execute(
                    "SELECT 1 FROM accounts WHERE login=%s", (args.login,)
                ).fetchone():
                    raise RuleError("ログインIDが見つかりません。")
                con.execute(
                    "UPDATE accounts SET password_hash=%s WHERE login=%s",
                    (auth.HASHER.hash(secret), args.login),
                )
                con.execute("DELETE FROM sessions WHERE login=%s", (args.login,))
            con.execute("UPDATE metadata SET revision=revision+1 WHERE id=1")
        print("完了しました。")
    except (RuleError, psycopg.IntegrityError) as exc:
        parser.exit(1, f"エラー: {exc}\n")


if __name__ == "__main__":
    main()
