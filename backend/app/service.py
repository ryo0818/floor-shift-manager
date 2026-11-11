"""Business rules shared by API and tests; no HTTP or database side effects."""

from calendar import monthrange
from copy import deepcopy
from datetime import date, datetime, timezone
import re
import uuid
from zoneinfo import ZoneInfo

JST = ZoneInfo("Asia/Tokyo")


class RuleError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def make_period(value):
    try:
        if not re.fullmatch(r"\d{4}-\d{2}-(01|16)", value):
            raise ValueError()
        start = date.fromisoformat(value)
        end = 15 if start.day == 1 else monthrange(start.year, start.month)[1]
        return {
            "id": value,
            "start": value,
            "end": start.replace(day=end).isoformat(),
            "deadline": None,
        }
    except (TypeError, ValueError):
        raise RuleError("対象期間が不正です。") from None


def instant(value):
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if result.tzinfo is None:
            raise ValueError()
        return result.astimezone(timezone.utc)
    except (TypeError, ValueError, AttributeError):
        raise RuleError(
            "締切日時にはタイムゾーンを含む有効な日時を指定してください。"
        ) from None


def overlaps(a, b):
    return a["date"] == b["date"] and a["start"] < b["end"] and b["start"] < a["end"]


def pairs(rows):
    for i, a in enumerate(rows):
        for b in rows[i + 1 :]:
            if overlaps(a, b):
                yield a, b


def validate_row(row, period, allowed):
    try:
        day = date.fromisoformat(row["date"])
    except ValueError:
        raise RuleError("日付が不正です。") from None
    if not period["start"] <= day.isoformat() <= period["end"]:
        raise RuleError("対象の半月に含まれる日を選んでください。")
    if row["start"] >= row["end"]:
        raise RuleError(
            "終了時刻は開始時刻より後にしてください。日付またぎはできません。"
        )
    if row["floorId"] not in allowed:
        raise RuleError("選択できないフロアです。割り当てを確認してください。")


def project(state, user, revision):
    admin = user["role"] == "admin"
    own = [e for e in state["employees"] if e["id"] == user.get("employeeId")]
    allowed = own[0]["floorIds"] if own else []
    submissions = deepcopy(state["submissions"])
    if admin:
        for s in submissions:
            s.update(draftRows=[], draftNote="", dirty=False)
    else:
        submissions = [s for s in submissions if s["employeeId"] == user["employeeId"]]
    return {
        "floors": deepcopy(
            state["floors"]
            if admin
            else [f for f in state["floors"] if f["id"] in allowed]
        ),
        "employees": deepcopy(state["employees"] if admin else own),
        "period": deepcopy(state["period"]),
        "submissions": submissions,
        "shifts": deepcopy(state["shifts"]) if admin else [],
        "revision": revision,
        "policy": {"allowEarlyConfirm": False},
    }


def apply(state, user, c, now=None):
    now = now or datetime.now(timezone.utc)
    today = now.astimezone(JST).date().isoformat()
    kind = c["type"]
    period, shifts = state["period"], state["shifts"]
    floor_ids = [f["id"] for f in state["floors"]]
    if kind in ("saveDraft", "submit"):
        if user["role"] != "employee":
            raise RuleError("本人の従業員アカウントから操作してください。", 403)
        if period["end"] < today or (period["deadline"] and instant(period["deadline"]) <= now):
            raise RuleError("受付が終了しています。変更は管理者にご相談ください。", 409)
        employee = next(
            (e for e in state["employees"] if e["id"] == user["employeeId"]), None
        )
        if not employee:
            raise RuleError("従業員が見つかりません。", 403)
        submission = next(
            (s for s in state["submissions"] if s["employeeId"] == employee["id"]), None
        )
        if submission is None:
            submission = {
                "employeeId": employee["id"],
                "draftRows": [],
                "draftNote": "",
                "submittedRows": [],
                "submittedNote": "",
                "submittedAt": None,
                "dirty": False,
            }
            state["submissions"].append(submission)
        if kind == "saveDraft":
            if len({r["id"] for r in c["rows"]}) != len(c["rows"]):
                raise RuleError("シフトIDが重複しています。")
            past_drafts = {r["id"]: r for r in submission["draftRows"] if r["date"] < today}
            for row in c["rows"]:
                if row["date"] < today or row["id"] in past_drafts:
                    if past_drafts.get(row["id"]) != row:
                        raise RuleError("過去日の希望は入力・変更できません。", 409)
                    continue
                validate_row(
                    row, period, [f for f in employee["floorIds"] if f in floor_ids]
                )
            submission.update(
                draftRows=deepcopy([*past_drafts.values(), *(r for r in c["rows"] if r["date"] >= today)]),
                draftNote=c["note"], dirty=True
            )
            return
        editable_drafts = [r for r in submission["draftRows"] if r["date"] >= today]
        for row in editable_drafts:
            validate_row(
                row, period, [f for f in employee["floorIds"] if f in floor_ids]
            )
        if next(pairs(editable_drafts), None) and not c["acknowledgeOverlap"]:
            raise RuleError(
                "重複する希望があります。確認してから提出してください。", 409
            )
        if any(
            s["employeeId"] == employee["id"] and s["date"] >= today and s["status"] != "pending"
            for s in shifts
        ):
            raise RuleError(
                "管理者が処理済みのシフトがあります。再提出は管理者にご相談ください。",
                409,
            )
        submission.update(
            submittedRows=deepcopy([*(r for r in submission["submittedRows"] if r["date"] < today), *editable_drafts]),
            submittedNote=submission["draftNote"],
            submittedAt=now.isoformat(),
            dirty=False,
        )
        # Server-generated management IDs prevent a client row ID from colliding with another person's shift.
        state["shifts"] = [s for s in shifts if s["employeeId"] != employee["id"] or s["date"] < today] + [
            {
                **deepcopy(r),
                "id": str(uuid.uuid4()),
                "employeeId": employee["id"],
                "status": "pending",
                "original": deepcopy(r),
            }
            for r in editable_drafts
        ]
        return
    if user["role"] != "admin":
        raise RuleError("管理者のみ操作できます。", 403)
    if kind == "setDeadline":
        deadline = instant(c["deadline"]) if c["deadline"] is not None else None
        was_closed = period["deadline"] and instant(period["deadline"]) <= now
        if (deadline is None or deadline > now) and was_closed and any(
            s["status"] != "pending" and s["date"] >= today for s in shifts
        ):
            raise RuleError(
                "確定・見送り済みがあります。未確定に戻してから受付を再開してください。",
                409,
            )
        period["deadline"] = deadline.isoformat() if deadline else None
    elif kind == "saveFloor":
        f = deepcopy(c["floor"])
        f["name"] = f["name"].strip()
        if not f["name"]:
            raise RuleError("フロア名を入力してください。")
        if any(x["id"] != f["id"] and x["name"] == f["name"] for x in state["floors"]):
            raise RuleError("同じフロア名があります。")
        state["floors"] = [x for x in state["floors"] if x["id"] != f["id"]] + [f]
    elif kind == "saveEmployee":
        e = deepcopy(c["employee"])
        e["name"] = e["name"].strip()
        if not e["name"]:
            raise RuleError("氏名を入力してください。")
        if any(f not in floor_ids for f in e["floorIds"]):
            raise RuleError("フロアを確認してください。")
        e["floorIds"] = list(dict.fromkeys(e["floorIds"]))
        state["employees"] = [x for x in state["employees"] if x["id"] != e["id"]] + [e]
    elif kind == "saveShift":
        row = deepcopy(c["shift"])
        validate_row(row, period, floor_ids)
        if not any(e["id"] == row["employeeId"] for e in state["employees"]):
            raise RuleError("従業員を選択してください。")
        old = next((s for s in shifts if s["id"] == row["id"]), None)
        if row["date"] < today or (old and old["date"] < today):
            raise RuleError("過去日のシフトは入力・変更できません。", 409)
        if old and old["status"] != "pending":
            raise RuleError("未確定に戻してから変更してください。", 409)
        if not c["acknowledgeOverlap"] and any(
            s["id"] != row["id"]
            and s["employeeId"] == row["employeeId"]
            and s["status"] != "declined"
            and overlaps(s, row)
            for s in shifts
        ):
            raise RuleError("時間が重複しています。確認してから登録してください。", 409)
        original = (
            old["original"]
            if old
            else {k: v for k, v in row.items() if k != "employeeId"}
        )
        new = {**row, "status": "pending", "original": deepcopy(original)}
        state["shifts"] = (
            [new if s["id"] == row["id"] else s for s in shifts]
            if old
            else shifts + [new]
        )
    elif kind == "deleteShift":
        old = next((s for s in shifts if s["id"] == c["id"]), None)
        if not old or old["status"] != "pending":
            raise RuleError("対象を確認し、未確定に戻してから削除してください。", 409)
        state["shifts"] = [s for s in shifts if s["id"] != c["id"]]
    elif kind == "setStatus":
        ids = set(c["ids"])
        target = [s for s in shifts if s["id"] in ids]
        if not ids or len(target) != len(ids):
            raise RuleError("対象のシフトを選択し直してください。", 409)
        status = c["status"]
        if any(
            (s["status"] == "pending")
            if status == "pending"
            else (s["status"] != "pending")
            for s in target
        ):
            raise RuleError("状態が変わっています。再確認してください。", 409)
        if status == "confirmed":
            if period["deadline"] and instant(period["deadline"]) > now:
                raise RuleError("締切を設定した期間は、締切後に確定できます。", 409)
            rows = [s for s in shifts if s["status"] == "confirmed" or s["id"] in ids]
            conflicts = [
                (a, b)
                for a, b in pairs(rows)
                if a["employeeId"] == b["employeeId"]
                and (a["id"] in ids or b["id"] in ids)
            ]
            if conflicts:
                names = {e["id"]: e["name"] for e in state["employees"]}
                floors = {f["id"]: f["name"] for f in state["floors"]}
                lines = [
                    f"{names[a['employeeId']]} / {a['date']} / {floors[a['floorId']]} {a['start']}–{a['end']} と {floors[b['floorId']]} {b['start']}–{b['end']}"
                    for a, b in conflicts[:20]
                ]
                raise RuleError(
                    "時間が重複しているため、全件の確定を中止しました。\n"
                    + "\n".join(lines),
                    409,
                )
        for s in target:
            s["status"] = status
    else:
        raise RuleError("未対応の操作です。")


def delete_floor(state, user, floor_id, all_periods):
    """Check every saved period, including private drafts and original requests."""
    if user["role"] != "admin":
        raise RuleError("管理者のみ操作できます。", 403)
    if not any(f["id"] == floor_id for f in state["floors"]):
        raise RuleError("フロアは削除済みです。再読み込みしてください。", 409)
    for bucket in all_periods:
        rows = []
        for shift in bucket.get("shifts", []):
            rows.append(shift)
            rows.append(shift.get("original") or {})
        for submission in bucket.get("submissions", []):
            rows.extend(submission.get("draftRows", []))
            rows.extend(submission.get("submittedRows", []))
        if any(row.get("floorId") == floor_id for row in rows):
            raise RuleError("このフロアは希望シフト・下書き・勤務シフト・元の希望のいずれかで使用中のため削除できません。過去・未来を含む全期間が対象です。", 409)
    state["floors"] = [f for f in state["floors"] if f["id"] != floor_id]
    for employee in state["employees"]:
        employee["floorIds"] = [f for f in employee["floorIds"] if f != floor_id]


def delete_employee(state, user, employee_id, all_periods):
    if user["role"] != "admin":
        raise RuleError("管理者のみ操作できます。", 403)
    if not any(e["id"] == employee_id for e in state["employees"]):
        raise RuleError("従業員は削除済みです。再読み込みしてください。", 409)
    for bucket in all_periods:
        if any(row.get("employeeId") == employee_id
               for row in bucket.get("shifts", []) + bucket.get("submissions", [])):
            raise RuleError("この従業員にはシフト・希望の提出履歴・保存済み下書きがあるため削除できません。全日休みの提出を含む、過去・未来の全期間が対象です。", 409)
    state["employees"] = [e for e in state["employees"] if e["id"] != employee_id]
