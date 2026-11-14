"""Business rules shared by API and tests; no HTTP or database side effects."""

from calendar import monthrange
from copy import deepcopy
from datetime import date, datetime, timezone
import re
import uuid
from zoneinfo import ZoneInfo

JST = ZoneInfo("Asia/Tokyo")


def earliest_selectable_date(current=None):
    current = current or datetime.now(JST).date()
    year, month = (current.year - 1, 12) if current.month == 1 else (current.year, current.month - 1)
    return date(year, month, min(current.day, monthrange(year, month)[1])).isoformat()


def require_selectable_period(period):
    if make_period(period)["end"] < earliest_selectable_date():
        raise RuleError("1か月より前の期間は選択できません。", 403)


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


def request_snapshot(row):
    return {key: deepcopy(row[key]) for key in ("id", "date", "start", "end", "floorId", "note", "fullTime") if key in row}


def normalized_request(row):
    return {**row, "fullTime": row.get("fullTime", False)}


def resolve_full_time(row, floors, employee=None):
    if row.get("fullTime"):
        floor = next((f for f in floors if f["id"] == row["floorId"]), None)
        if floor is None:
            raise RuleError("選択できないフロアです。")
        staff = (employee or {}).get("employmentType") == "staff"
        row.update(start=(floor.get("staffWorkStart") if staff else None) or floor.get("workStart", "09:00"),
                   end=(floor.get("staffWorkEnd") if staff else None) or floor.get("workEnd", "17:00"))
    if not row.get("fullTime") and "[フルタイム]" not in row.get("note", "").split("\n"):
        return row
    lines = [line for line in row.get("note", "").split("\n") if line != "[フルタイム]"]
    if row.get("fullTime"):
        lines.append("[フルタイム]")
    row["note"] = "\n".join(lines).strip("\n")
    if len(row["note"]) > 500:
        raise RuleError("フルタイムの表示を含めてメモは500文字以内で入力してください。")
    return row


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
        for submission in submissions:
            submission.pop("latestChanges", None)
    return {
        "floors": deepcopy(
            state["floors"]
            if admin
            else [{k:v for k,v in f.items() if k != "employeeOrder"} for f in state["floors"] if f["id"] in allowed]
        ),
        "employees": deepcopy(state["employees"] if admin else own),
        "period": deepcopy(state["period"]),
        "submissions": submissions,
        "shifts": deepcopy(state["shifts"]) if admin else [],
        "confirmedSchedule": [] if admin else [
            {**{k: s[k] for k in ("id", "date", "start", "end", "floorId")},
             "fullTime": s.get("fullTime", False),
             "floorName": next((f["name"] for f in state["floors"] if f["id"] == s["floorId"]), "未登録")}
            for s in state["shifts"]
            if s["employeeId"] == user.get("employeeId") and s["status"] == "confirmed"
        ],
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
        if not employee or employee.get("active", True) is False:
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
                    original = past_drafts.get(row["id"])
                    if original is None or {**original, "fullTime": original.get("fullTime", False)} != {**row, "fullTime": row.get("fullTime", False)}:
                        raise RuleError("過去日の希望は入力・変更できません。", 409)
                    continue
                resolve_full_time(row, state["floors"], employee)
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
        previous_ids = {r["id"] for r in submission["submittedRows"]}
        previous = {s["original"]["id"]: s for s in shifts
                    if s["employeeId"] == employee["id"] and s.get("original", {}).get("id") in previous_ids}
        keep = [s for s in shifts if s["employeeId"] != employee["id"] or s["date"] < today
                or s.get("original", {}).get("id") not in previous_ids]
        updated = []
        changes = []
        prior_rows = {r["id"]: r for r in submission["submittedRows"] if r["date"] >= today}
        incoming_ids = {r["id"] for r in editable_drafts}
        for id_, prior in prior_rows.items():
            old = previous.get(id_)
            if id_ not in incoming_ids and not (old and old["date"] < today):
                changes.append({"before": request_snapshot(old or prior), "after": None, "at": now.isoformat()})
        for row in editable_drafts:
            old = previous.get(row["id"])
            if old and old["date"] < today:
                # An administrator may have moved an original future request into the past.
                if normalized_request(row) != normalized_request(old["original"]):
                    raise RuleError("過去日の勤務に対応する希望は変更できません。", 409)
                continue
            if old and normalized_request(row) == normalized_request(old["original"]):
                updated.append(old)
            else:
                new = {**deepcopy(row), "id": old["id"] if old else str(uuid.uuid4()),
                       "employeeId": employee["id"], "status": "pending", "original": deepcopy(row)}
                if submission["submittedAt"]:
                    change = {"before": request_snapshot(old or prior_rows[row["id"]]) if old or row["id"] in prior_rows else None,
                              "after": deepcopy(row), "at": now.isoformat()}
                    changes.append(change)
                    new["requestChange"] = {**change, "before": deepcopy(old["requestChange"]["before"]) if old and old.get("requestChange") else change["before"]}
                updated.append(new)
        if changes:
            submission["latestChanges"] = changes
        submission.update(
            submittedRows=deepcopy([*(r for r in submission["submittedRows"] if r["date"] < today), *editable_drafts]),
            submittedNote=submission["draftNote"],
            submittedAt=now.isoformat(),
            dirty=False,
        )
        state["shifts"] = keep + updated
        return
    if user["role"] != "admin":
        raise RuleError("管理者のみ操作できます。", 403)
    if kind == "setDeadline":
        deadline = instant(c["deadline"]) if c["deadline"] is not None else None
        period["deadline"] = deadline.isoformat() if deadline else None
    elif kind == "saveFloor":
        f = deepcopy(c["floor"])
        f["name"] = f["name"].strip()
        if f.get("workStart", "09:00") >= f.get("workEnd", "17:00"):
            raise RuleError("フルタイムの終了は開始より後にしてください。")
        if (f.get("staffWorkStart") or f.get("workStart", "09:00")) >= (f.get("staffWorkEnd") or f.get("workEnd", "17:00")):
            raise RuleError("社員のフルタイムの終了は開始より後にしてください。")
        order = f.get("employeeOrder", [])
        assigned = {e["id"] for e in state["employees"] if f["id"] in e["floorIds"]}
        if len(order) != len(set(order)) or any(id_ not in assigned for id_ in order):
            raise RuleError("並び順にはこのフロアに割り当てた従業員を重複なく指定してください。")
        if not f["name"]:
            raise RuleError("フロア名を入力してください。")
        if any(x["id"] != f["id"] and x["name"] == f["name"] for x in state["floors"]):
            raise RuleError("同じフロア名があります。")
        state["floors"] = [x for x in state["floors"] if x["id"] != f["id"]] + [f]
    elif kind == "setEmployeeActive":
        employee = next((e for e in state["employees"] if e["id"] == c["id"]), None)
        if not employee:
            raise RuleError("従業員が見つかりません。", 404)
        employee["active"] = c["active"]
    elif kind == "saveEmployee":
        e = deepcopy(c["employee"])
        old_employee = next((x for x in state["employees"] if x["id"] == e["id"]), None)
        e["active"] = old_employee.get("active", True) if old_employee else True
        e["name"] = e["name"].strip()
        if not e["name"]:
            raise RuleError("氏名を入力してください。")
        if any(f not in floor_ids for f in e["floorIds"]):
            raise RuleError("フロアを確認してください。")
        e["floorIds"] = list(dict.fromkeys(e["floorIds"]))
        for floor in state["floors"]:
            if floor["id"] not in e["floorIds"] and "employeeOrder" in floor:
                floor["employeeOrder"] = [id_ for id_ in floor["employeeOrder"] if id_ != e["id"]]
        state["employees"] = [x for x in state["employees"] if x["id"] != e["id"]] + [e]
    elif kind == "saveShift":
        row = resolve_full_time(deepcopy(c["shift"]), state["floors"], next((e for e in state["employees"] if e["id"] == c["shift"]["employeeId"]), None))
        validate_row(row, period, floor_ids)
        if not any(e["id"] == row["employeeId"] for e in state["employees"]):
            raise RuleError("従業員を選択してください。")
        old = next((s for s in shifts if s["id"] == row["id"]), None)
        employee = next(e for e in state["employees"] if e["id"] == row["employeeId"])
        if employee.get("active", True) is False and (not old or old["employeeId"] != row["employeeId"]):
            raise RuleError("退職者へ新しいシフトを追加できません。", 409)
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
        if old and old.get("requestChange"):
            new["requestChange"] = deepcopy(old["requestChange"])
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
            inactive = {e["id"] for e in state["employees"] if e.get("active", True) is False}
            if any(s["employeeId"] in inactive for s in target):
                raise RuleError("退職者のシフトは確定できません。対象から外してください。", 409)
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
            if status != "pending":
                s.pop("requestChange", None)
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
    for floor in state["floors"]:
        if "employeeOrder" in floor:
            floor["employeeOrder"] = [id_ for id_ in floor["employeeOrder"] if id_ != employee_id]
