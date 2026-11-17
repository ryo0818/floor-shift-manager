from copy import deepcopy
from datetime import datetime, timezone
import pytest
from app.service import apply, make_period, RuleError

NOW = datetime(2030, 4, 1, tzinfo=timezone.utc)
EMP = {"role":"employee", "employeeId":"e1"}
ADMIN = {"role":"admin"}

def state():
    return dict(period=make_period("2030-04-01"), floors=[dict(id="f1",name="Hall",color="#123456",workStart="10:15",workEnd="21:45")], employees=[dict(id="e1",floorIds=["f1"])], shifts=[],submissions=[])

def row():
    return dict(id="r",date="2030-04-02",start="18:00",end="22:00",floorId="f1",note="")

def save(s,r):
    apply(s,EMP,dict(type="saveDraft",rows=[r],note=""),NOW)

@pytest.mark.parametrize("key,value",[("start","18:15"),("end","21:45")])
def test_new_quarter_hour_request_is_rejected(key,value):
    with pytest.raises(RuleError,match="30分"):
        save(state(),{**row(),key:value})

def test_half_hours_submit_and_admin_can_adjust_by_quarter_hour():
    s=state();save(s,row())
    apply(s,EMP,dict(type="submit",acknowledgeOverlap=False),NOW)
    shift={**s["shifts"][0],"start":"18:15","end":"21:45"}
    apply(s,ADMIN,dict(type="saveShift",shift=shift,acknowledgeOverlap=False),NOW)
    assert s["shifts"][0]["start"]=="18:15"
    assert s["shifts"][0]["original"]["start"]=="18:00"

def test_existing_quarter_hours_are_preserved_but_cannot_be_copied_or_changed():
    s=state();save(s,row())
    legacy={**row(),"start":"18:15","end":"21:45"}
    s["submissions"][0]["draftRows"]=[deepcopy(legacy)]
    save(s,{**legacy,"note":"keep"})
    apply(s,EMP,dict(type="submit",acknowledgeOverlap=False),NOW)
    assert s["shifts"][0]["end"]=="21:45"
    for patch in ({"date":"2030-04-03"},{"id":"copy"},{"end":"22:15"}):
        with pytest.raises(RuleError,match="30分"):
            save(deepcopy(s),{**legacy,**patch})
    save(s,{**legacy,"end":"22:30"})
    assert s["submissions"][0]["draftRows"][0]["start"]=="18:15"

def test_full_time_uses_floor_times_without_rounding():
    s=state();save(s,{**row(),"fullTime":True})
    saved=s["submissions"][0]["draftRows"][0]
    assert (saved["start"],saved["end"])==("10:15","21:45")
