from copy import deepcopy
from datetime import datetime, timezone
import pytest
from pydantic import ValidationError
from app.models import Row, Floor
from app.service import apply, make_period, RuleError

NOW = datetime(2030, 4, 1, tzinfo=timezone.utc)
ADMIN = {"role": "admin"}
EMPLOYEE = {"role": "employee", "employeeId": "e1"}

def state():
    return dict(period=make_period("2030-04-01"), floors=[dict(id="f1", name="Hall", color="#123456", workStart="08:30", workEnd="19:00")], employees=[dict(id="e1", floorIds=["f1"])], shifts=[], submissions=[])

def row(**kw):
    return dict(id="r1", date="2030-04-02", start="10:00", end="17:00", floorId="f1", note="", **kw)

def test_full_time_is_resolved_on_save_and_submitted_with_flag():
    s = state()
    apply(s, EMPLOYEE, dict(type="saveDraft", rows=[row(fullTime=True)], note=""), NOW)
    saved = deepcopy(s["submissions"][0]["draftRows"][0])
    assert (saved["start"], saved["end"]) == ("08:30", "19:00")
    s["floors"][0]["workEnd"] = "20:00"
    apply(s, EMPLOYEE, dict(type="submit", acknowledgeOverlap=False), NOW)
    assert s["shifts"][0]["original"] == saved
    assert s["shifts"][0]["fullTime"] is True

def test_admin_full_time_and_explicit_times_are_independent():
    s = state()
    r = {**row(fullTime=True), "employeeId": "e1"}
    apply(s, ADMIN, dict(type="saveShift", shift=r, acknowledgeOverlap=False), NOW)
    assert s["shifts"][0]["start"] == "08:30"
    r.update(fullTime=False, start="10:15", end="18:00")
    apply(s, ADMIN, dict(type="saveShift", shift=r, acknowledgeOverlap=False), NOW)
    assert s["shifts"][0]["start"] == "10:15"
    assert s["shifts"][0]["original"]["fullTime"] is True

def test_invalid_floor_hours_and_non_boolean_mode_rejected():
    s = state()
    with pytest.raises(RuleError):
        apply(s, ADMIN, dict(type="saveFloor", floor={**s["floors"][0], "workEnd":"08:30"}), NOW)
    with pytest.raises(ValidationError):
        Floor(id="f", name="Hall", color="#123456", workStart="09:01")
    with pytest.raises(ValidationError):
        Row(**row(fullTime="true"))

def test_legacy_past_draft_accepts_default_false_without_modification():
    s = state()
    past = row()
    apply(s, EMPLOYEE, dict(type="saveDraft", rows=[past], note=""), NOW)
    later = datetime(2030, 4, 3, tzinfo=timezone.utc)
    apply(s, EMPLOYEE, dict(type="saveDraft", rows=[Row(**past).model_dump()], note=""), later)
    assert s["submissions"][0]["draftRows"] == [past]
    with pytest.raises(RuleError, match="過去日"):
        apply(s, EMPLOYEE, dict(type="saveDraft", rows=[{**past,"fullTime":True}], note=""), later)

def test_full_time_note_is_added_once_and_removed_without_losing_user_note():
    s = state()
    r = {**row(fullTime=True), "employeeId": "e1", "note": "相談あり"}
    apply(s, ADMIN, dict(type="saveShift", shift=r, acknowledgeOverlap=False), NOW)
    saved = s["shifts"][0]
    assert saved["note"] == "相談あり\n[フルタイム]"
    r["note"] = saved["note"]
    apply(s, ADMIN, dict(type="saveShift", shift=r, acknowledgeOverlap=False), NOW)
    assert s["shifts"][0]["note"] == r["note"]
    r["fullTime"] = False
    apply(s, ADMIN, dict(type="saveShift", shift=r, acknowledgeOverlap=False), NOW)
    assert s["shifts"][0]["note"] == "相談あり"


def test_full_time_note_length_does_not_silently_truncate():
    s = state()
    r = {**row(fullTime=True), "note": "あ" * 500}
    with pytest.raises(RuleError, match="500文字"):
        apply(s, EMPLOYEE, dict(type="saveDraft", rows=[r], note=""), NOW)
