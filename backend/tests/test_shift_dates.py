from copy import deepcopy
from datetime import datetime, timezone

import pytest

from app.service import RuleError, apply, make_period

ADMIN = {"role": "admin"}
EMPLOYEE = {"role": "employee", "employeeId": "e1"}
BEFORE_MIDNIGHT = datetime(2030, 4, 2, 14, 59, tzinfo=timezone.utc)
MIDNIGHT = datetime(2030, 4, 2, 15, 0, tzinfo=timezone.utc)


def state():
    return {
        "period": make_period("2030-04-01"),
        "floors": [{"id": "f1"}],
        "employees": [{"id": "e1", "floorIds": ["f1"]}],
        "shifts": [],
        "submissions": [],
    }


def row(id_, day):
    return {"id": id_, "date": day, "start": "09:00", "end": "17:00", "floorId": "f1", "note": ""}


def save(s, now, *rows):
    apply(s, EMPLOYEE, {"type": "saveDraft", "rows": list(rows), "note": ""}, now)


def submit(s, now):
    apply(s, EMPLOYEE, {"type": "submit", "acknowledgeOverlap": False}, now)


def test_midnight_jst_locks_past_days_without_requiring_deadline():
    s = state()
    yesterday = row("r1", "2030-04-02")
    today = row("r2", "2030-04-03")
    save(s, BEFORE_MIDNIGHT, yesterday)
    submit(s, BEFORE_MIDNIGHT)
    old_shift = s["shifts"][0]
    apply(s, ADMIN, {"type": "setStatus", "status": "confirmed", "ids": [old_shift["id"]]}, MIDNIGHT)
    history = deepcopy(old_shift)

    for edit in ({**yesterday, "start": "10:00"}, {**yesterday, "date": today["date"]},
                 {**yesterday, "id": "new-past"}):
        with pytest.raises(RuleError, match="過去日"):
            save(s, MIDNIGHT, edit, today)
    save(s, MIDNIGHT, today)
    submit(s, MIDNIGHT)
    assert s["submissions"][0]["draftRows"] == [yesterday, today]
    assert s["submissions"][0]["submittedRows"] == [yesterday, today]
    assert s["shifts"][0] == history
    assert s["shifts"][1]["original"] == today


def test_past_unsent_draft_does_not_become_a_submitted_shift():
    s = state()
    yesterday = row("r1", "2030-04-02")
    today = row("r2", "2030-04-03")
    save(s, BEFORE_MIDNIGHT, yesterday, today)
    submit(s, MIDNIGHT)
    assert s["submissions"][0]["submittedRows"] == [today]
    assert [r["date"] for r in s["shifts"]] == [today["date"]]


def test_explicit_deadline_can_be_cleared_and_admin_cannot_add_past_shift():
    s = state()
    apply(s, ADMIN, {"type": "setDeadline", "deadline": MIDNIGHT.isoformat()}, MIDNIGHT)
    with pytest.raises(RuleError, match="受付が終了"):
        save(s, MIDNIGHT, row("r1", "2030-04-03"))
    apply(s, ADMIN, {"type": "setDeadline", "deadline": None}, MIDNIGHT)
    save(s, MIDNIGHT, row("r1", "2030-04-03"))
    with pytest.raises(RuleError, match="過去日"):
        apply(s, ADMIN, {"type": "saveShift", "shift": {
            **row("past", "2030-04-02"), "employeeId": "e1",
        }, "acknowledgeOverlap": False}, MIDNIGHT)
