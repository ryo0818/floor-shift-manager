from copy import deepcopy
from datetime import datetime, timezone
import pytest
from app.service import apply, project, make_period, RuleError
from app import auth

NOW = datetime(2030, 4, 1, tzinfo=timezone.utc)
ADMIN = {"role": "admin"}
OWN = {"role": "employee", "employeeId": "e1"}

def state():
    row = dict(id="r1", date="2030-04-03", start="18:00", end="22:00", floorId="f2", note="管理者専用メモ", fullTime=True)
    return dict(period=make_period("2030-04-01"),
                floors=[dict(id="f1", name="1F"), dict(id="f2", name="2F")],
                employees=[dict(id="e1", name="本人", floorIds=["f1"]), dict(id="e2", name="他人", floorIds=["f2"])],
                submissions=[], shifts=[dict(**row, employeeId="e1", status="confirmed", original=deepcopy(row)),
                  dict(**{**row,"id":"other"}, employeeId="e2", status="confirmed", original=row),
                  dict(**{**row,"id":"pending"}, employeeId="e1", status="pending", original=row)])

def test_own_confirmed_schedule_is_minimal_and_keeps_unassigned_floor_name():
    s=state();result=project(s, OWN, 1)
    assert result["shifts"] == []
    assert [f["id"] for f in result["floors"]] == ["f1"]
    assert result["confirmedSchedule"] == [dict(id="r1",date="2030-04-03",start="18:00",end="22:00",floorId="f2",floorName="2F",fullTime=True)]
    assert "管理者専用メモ" not in str(result)
    assert [e["id"] for e in result["employees"]] == ["e1"]

def test_retirement_preserves_history_and_restoration_and_edit_cannot_reactivate():
    s=state();before=deepcopy(s["shifts"])
    apply(s, ADMIN, dict(type="setEmployeeActive",id="e1",active=False), NOW)
    assert s["shifts"]==before
    apply(s, ADMIN, dict(type="saveEmployee",employee=dict(id="e1",name="改名",floorIds=["f1"],active=True)), NOW)
    assert next(e for e in s["employees"] if e["id"]=="e1")["active"] is False
    apply(s, ADMIN, dict(type="setEmployeeActive",id="e1",active=True), NOW)
    assert s["shifts"]==before
    assert next(e for e in s["employees"] if e["id"]=="e1")["active"] is True

def test_retired_employee_cannot_submit_or_receive_new_work_or_be_confirmed():
    s=state();apply(s, ADMIN, dict(type="setEmployeeActive",id="e1",active=False), NOW)
    for cmd in [dict(type="saveDraft",rows=[],note=""),dict(type="submit",acknowledgeOverlap=False),dict(type="setEmployeeActive",id="e1",active=True)]:
        with pytest.raises(RuleError): apply(s,OWN,cmd,NOW)
    new={k:v for k,v in s["shifts"][0].items() if k not in ("status","original")};new["id"]="new"
    with pytest.raises(RuleError,match="退職者"):
        apply(s,ADMIN,dict(type="saveShift",shift=new,acknowledgeOverlap=True),NOW)
    with pytest.raises(RuleError,match="退職者"):
        apply(s,ADMIN,dict(type="setStatus",ids=["pending"],status="confirmed"),NOW)
    # Existing work can still be explicitly withdrawn by the administrator.
    apply(s,ADMIN,dict(type="setStatus",ids=["pending"],status="declined"),NOW)

@pytest.mark.parametrize("active,allowed", [(None,True),(True,True),(False,False)])
def test_session_user_rechecks_employee_status_for_old_sessions(active,allowed):
    employee=dict(id="e1",name="本人")
    if active is not None:employee["active"]=active
    class Result:
        def __init__(self,row):self.row=row
        def fetchone(self):return self.row
    class Connection:
        def execute(self,query,args):
            return Result(dict(role="employee",employee_id="e1",must_change_password=False) if "FROM accounts" in query else dict(data=employee))
    assert bool(auth.session_user(Connection(),dict(login="emp"))) is allowed
