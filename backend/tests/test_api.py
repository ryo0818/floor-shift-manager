from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import os
import uuid
import psycopg
from psycopg import sql
from psycopg.conninfo import make_conninfo
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app import auth, db
from app.manage import seed

PERIOD = "2030-04-01"
PASSWORD = "test-password-12345"


@pytest.fixture
def system(monkeypatch, request):
    url = os.getenv("TEST_DATABASE_URL")
    if not url:
        pytest.skip(
            "Set TEST_DATABASE_URL to a PostgreSQL test database (CREATE SCHEMA permission required)."
        )
    schema = "test_" + uuid.uuid4().hex
    with psycopg.connect(url, autocommit=True) as con:
        con.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
    path = make_conninfo(url, options=f"-c search_path={schema}")
    original_connect = db.connect

    def isolated_connect(dsn):
        con = original_connect(dsn)
        con.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(schema)))
        return con

    monkeypatch.setattr(db, "connect", isolated_connect)

    def cleanup():
        with psycopg.connect(url, autocommit=True) as con:
            con.execute(
                sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema))
            )

    request.addfinalizer(cleanup)
    db.initialize(path)
    app = create_app(path)
    with TestClient(app) as client:
        with db.transaction(path, write=True) as con:
            seed(con)
            for e in [
                {"id": "e1", "name": "本人", "floorIds": ["f1", "f2"]},
                {"id": "e2", "name": "他の人", "floorIds": ["f1"]},
            ]:
                db.put(con, "employees", e)
            auth.create_account(con, "admin", PASSWORD, "admin")
            auth.create_account(con, "employee1", PASSWORD, "employee", "e1")
            auth.create_account(con, "employee2", PASSWORD, "employee", "e2")
        yield app, path, client


def login(client, who="admin"):
    r = client.get("/api/session")
    assert r.status_code == 200
    r = client.post(
        "/api/session/login",
        json={"id": who, "password": PASSWORD},
        headers={"X-CSRF-TOKEN": r.json()["csrfToken"]},
    )
    assert r.status_code == 200, r.text
    client.headers["X-CSRF-TOKEN"] = r.json()["csrfToken"]
    return r.json()["session"]


def workspace(client):
    r = client.get("/api/workspace", params={"period": PERIOD})
    assert r.status_code == 200, r.text
    return r.json()


def command(client, kind, **args):
    return client.post(
        "/api/commands",
        json={
            "period": PERIOD,
            "expectedRevision": workspace(client)["revision"],
            "type": kind,
            **args,
        },
    )


def ok(client, kind, **args):
    r = command(client, kind, **args)
    assert r.status_code == 200, r.text
    return r


def deadline(client, days):
    return ok(
        client,
        "setDeadline",
        deadline=(datetime.now(timezone.utc) + timedelta(days=days)).isoformat(),
    )


def row(id="r1", **overrides):
    return {
        "id": id,
        "date": "2030-04-03",
        "start": "09:00",
        "end": "12:00",
        "floorId": "f1",
        "note": "",
        **overrides,
    }


def shift(client, id="s1", **overrides):
    return ok(
        client,
        "saveShift",
        shift={**row(id), "employeeId": "e1", **overrides},
        acknowledgeOverlap=True,
    )


def test_authentication_csrf_rotation_logout(system):
    app, path, c = system
    assert c.get("/api/workspace", params={"period": PERIOD}).status_code == 401
    anon = c.get("/api/session")
    old = c.cookies.get(auth.COOKIE)
    assert (
        "HttpOnly" in anon.headers["set-cookie"]
        and "SameSite=lax" in anon.headers["set-cookie"]
    )
    assert (
        c.post(
            "/api/session/login", json={"id": "admin", "password": PASSWORD}
        ).status_code
        == 403
    )
    assert login(c)["role"] == "admin"
    assert c.cookies.get(auth.COOKIE) != old
    assert (
        c.post(
            "/api/commands",
            headers={"X-CSRF-TOKEN": "wrong"},
            json={
                "type": "setStatus",
                "period": PERIOD,
                "expectedRevision": 0,
                "ids": ["s1"],
                "status": "confirmed",
            },
        ).status_code
        == 403
    )
    token = c.cookies.get(auth.COOKIE)
    r = c.post("/api/session/logout", json={})
    assert r.status_code == 200
    c.headers["X-CSRF-TOKEN"] = r.json()["csrfToken"]
    assert c.get("/api/session").json()["session"] is None
    with TestClient(app) as stolen:
        stolen.cookies.set(auth.COOKIE, token)
        assert (
            stolen.get("/api/workspace", params={"period": PERIOD}).status_code == 401
        )
    assert login(c, "employee1")["employeeId"] == "e1"
    with db.transaction(path) as con:
        stored = con.execute(
            "SELECT password_hash FROM accounts WHERE login=%s", ("admin",)
        ).fetchone()["password_hash"]
        assert stored.startswith("$argon2id$") and PASSWORD not in stored


def test_employee_privacy_draft_submission_and_persistence(system):
    app, path, admin = system
    login(admin)
    deadline(admin, 2)
    with TestClient(app) as employee:
        login(employee, "employee1")
        own = workspace(employee)
        assert [e["id"] for e in own["employees"]] == ["e1"]
        assert {f["id"] for f in own["floors"]} == {"f1", "f2"}
        assert own["shifts"] == []
        ok(employee, "saveDraft", rows=[row()], note="本人のメモ")
        assert workspace(admin)["shifts"] == []
        sub = workspace(admin)["submissions"][0]
        assert (
            sub["draftRows"] == []
            and sub["draftNote"] == ""
            and sub["submittedAt"] is None
        )
        ok(employee, "submit", acknowledgeOverlap=False)
        saved = workspace(admin)
        assert saved["shifts"][0]["employeeId"] == "e1"
        assert saved["shifts"][0]["id"] != "r1"
        ok(employee, "saveDraft", rows=[row(end="13:00")], note="変更中")
        assert workspace(admin)["shifts"][0]["end"] == "12:00"
        assert workspace(employee)["submissions"][0]["dirty"]
        assert (
            command(
                employee,
                "saveFloor",
                floor={"id": "x", "name": "不正", "color": "#ffffff"},
            ).status_code
            == 403
        )
        assert (
            command(
                employee, "saveDraft", rows=[row(floorId="f3")], note=""
            ).status_code
            == 400
        )
        assert workspace(employee)["shifts"] == []
    # A new app instance reads the same persisted database, not an in-memory cache.
    with TestClient(create_app(path)) as restart:
        login(restart)
        assert workspace(restart)["shifts"] == saved["shifts"]


def test_empty_submission_resubmit_overlap_and_deadline(system):
    app, _, admin = system
    login(admin)
    deadline(admin, 2)
    with TestClient(app) as e:
        login(e, "employee1")
        ok(
            e,
            "saveDraft",
            rows=[row(), row("r2", floorId="f2", start="11:00", end="14:00")],
            note="",
        )
        assert command(e, "submit", acknowledgeOverlap=False).status_code == 409
        assert workspace(admin)["shifts"] == []
        ok(e, "submit", acknowledgeOverlap=True)
        assert len(workspace(admin)["shifts"]) == 2
        ok(e, "saveDraft", rows=[], note="全日休み")
        ok(e, "submit", acknowledgeOverlap=False)
        assert workspace(admin)["shifts"] == []
        assert workspace(admin)["submissions"][0]["submittedAt"]
        deadline(admin, -1)
        assert command(e, "saveDraft", rows=[], note="").status_code == 409
        assert command(e, "submit", acknowledgeOverlap=True).status_code == 409


def test_atomic_confirmation_existing_conflict_and_state_transition(system):
    _, _, c = system
    login(c)
    deadline(c, -1)
    shift(c, "a")
    shift(c, "b", floorId="f2", start="11:00", end="14:00")
    shift(c, "c", employeeId="e2")
    before = workspace(c)
    r = command(c, "setStatus", ids=["a", "b", "c"], status="confirmed")
    assert r.status_code == 409 and "全件" in r.json()["message"]
    assert workspace(c) == before
    ok(c, "setStatus", ids=["a", "c"], status="confirmed")
    assert command(c, "setStatus", ids=["b"], status="confirmed").status_code == 409
    assert (
        command(
            c,
            "saveShift",
            shift={**row("a"), "employeeId": "e1"},
            acknowledgeOverlap=True,
        ).status_code
        == 409
    )
    assert command(c, "deleteShift", id="a").status_code == 409
    ok(c, "setStatus", ids=["a"], status="pending")
    shift(c, "a", end="11:00")
    ok(c, "setStatus", ids=["a", "b"], status="confirmed")
    assert all(s["status"] == "confirmed" for s in workspace(c)["shifts"])
    assert workspace(c)["shifts"][0]["original"]["end"] == "12:00"
    assert (
        command(
            c,
            "setDeadline",
            deadline=(datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
        ).status_code
        == 409
    )
    ok(c, "setStatus", ids=["a"], status="pending")
    ok(c, "setStatus", ids=["a"], status="declined")
    ok(c, "setStatus", ids=["a"], status="pending")
    ok(c, "deleteShift", id="a")
    assert len(workspace(c)["shifts"]) == 2


def test_early_confirmation_and_reassignment(system):
    _, _, c = system
    login(c)
    deadline(c, 2)
    shift(c, "s1", floorId="f5")  # Admin is not limited by employee floor assignments.
    assert command(c, "setStatus", ids=["s1"], status="confirmed").status_code == 409
    deadline(c, -1)
    ok(c, "setStatus", ids=["s1"], status="confirmed")


@pytest.mark.parametrize(
    "change",
    [
        {"start": "09:10"},
        {"start": "22:00", "end": "05:00"},
        {"end": "09:00"},
        {"date": "2030-04-31"},
        {"date": "2030-04-16"},
        {"floorId": "missing"},
        {"note": "a" * 501},
    ],
)
def test_bad_rows_do_not_mutate(system, change):
    _, _, c = system
    login(c)
    before = workspace(c)
    assert command(
        c,
        "saveShift",
        shift={**row(), "employeeId": "e1", **change},
        acknowledgeOverlap=True,
    ).status_code in (400, 422)
    assert workspace(c) == before


def test_invalid_command_and_forged_identity(system):
    app, _, c = system
    login(c)
    deadline(c, 2)
    assert c.get("/api/workspace?period=2030-99-01").status_code == 400
    assert command(c, "setDeadline", deadline="2030-01-01T09:00:00").status_code == 400
    with TestClient(app) as e:
        login(e, "employee1")
        assert (
            command(e, "saveDraft", rows=[row()], note="", employeeId="e2").status_code
            == 422
        )
        assert command(e, "saveDraft", rows=[row(), row()], note="").status_code == 400
        assert (
            command(e, "saveDraft", rows=[row()], note="", extra="ignored?").status_code
            == 422
        )
        assert (
            command(e, "setStatus", ids=["missing"], status="hacked").status_code == 422
        )


def test_master_management(system):
    _, _, c = system
    login(c)
    ok(c, "saveFloor", floor={"id": "f6", "name": "屋上", "color": "#aabbcc"})
    ok(c, "saveEmployee", employee={"id": "e3", "name": "新人", "floorIds": ["f6"]})
    ok(
        c,
        "saveEmployee",
        employee={"id": "e3", "name": "新人さん", "floorIds": ["f1", "f6"]},
    )
    assert next(e for e in workspace(c)["employees"] if e["id"] == "e3")[
        "floorIds"
    ] == ["f1", "f6"]
    assert (
        command(
            c, "saveFloor", floor={"id": "f7", "name": "屋上", "color": "#ffffff"}
        ).status_code
        == 400
    )
    assert (
        command(
            c, "saveEmployee", employee={"id": "e4", "name": " ", "floorIds": []}
        ).status_code
        == 400
    )
    assert (
        command(
            c,
            "saveEmployee",
            employee={"id": "e4", "name": "名前", "floorIds": ["missing"]},
        ).status_code
        == 400
    )


def test_stale_revision_and_concurrent_commands(system):
    app, _, c = system
    login(c)
    deadline(c, -1)
    shift(c, "a")
    with TestClient(app) as second:
        login(second)
        rev = workspace(c)["revision"]
        payload = {
            "type": "setStatus",
            "period": PERIOD,
            "expectedRevision": rev,
            "ids": ["a"],
            "status": "confirmed",
        }
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [
                pool.submit(client.post, "/api/commands", json=payload)
                for client in (c, second)
            ]
            assert sorted(f.result().status_code for f in futures) == [200, 409]
        assert workspace(c)["shifts"][0]["status"] == "confirmed"


def test_origin_throttling_and_no_password_echo(system):
    _, _, c = system
    csrf = c.get("/api/session").json()["csrfToken"]
    assert (
        c.post(
            "/api/session/login",
            headers={"origin": "https://evil.example", "X-CSRF-TOKEN": csrf},
            json={"id": "admin", "password": PASSWORD},
        ).status_code
        == 403
    )
    c.headers["X-CSRF-TOKEN"] = csrf
    for _ in range(10):
        r = c.post(
            "/api/session/login", json={"id": "admin", "password": "wrong-password"}
        )
        assert r.status_code == 401 and "wrong-password" not in r.text
    assert (
        c.post(
            "/api/session/login", json={"id": "admin", "password": PASSWORD}
        ).status_code
        == 429
    )


def test_secure_cookie_and_expiration(system):
    app, path, c = system
    login(c)
    with db.transaction(path, write=True) as con:
        con.execute("UPDATE sessions SET expires=0")
    assert c.get("/api/workspace", params={"period": PERIOD}).status_code == 401
    with TestClient(
        create_app(path, secure_cookie=True), base_url="https://testserver"
    ) as secure:
        assert "Secure" in secure.get("/api/session").headers["set-cookie"]


def test_client_row_id_cannot_overwrite_another_employee(system):
    app, _, c = system
    login(c)
    deadline(c, 2)
    with TestClient(app) as e1, TestClient(app) as e2:
        for client, who in [(e1, "employee1"), (e2, "employee2")]:
            login(client, who)
            ok(client, "saveDraft", rows=[row("same-id")], note="")
            ok(client, "submit", acknowledgeOverlap=False)
        saved = workspace(c)["shifts"]
        assert len(saved) == 2 and len({s["id"] for s in saved}) == 2
        assert {s["employeeId"] for s in saved} == {"e1", "e2"}


def sign_in_with(client, who, password):
    csrf = client.get('/api/session').json()['csrfToken']
    r = client.post('/api/session/login', json={'id': who, 'password': password}, headers={'X-CSRF-TOKEN': csrf})
    if r.status_code == 200:
        client.headers['X-CSRF-TOKEN'] = r.json()['csrfToken']
    return r


def test_account_create_force_change_and_permissions(system):
    app, path, admin = system
    login(admin)
    ok(admin, 'saveEmployee', employee={'id':'e3','name':'新人','floorIds':['f1']})
    payload = {'login':'new.employee','employeeId':'e3','password':'temporary-password-123'}
    assert admin.post('/api/accounts', json=payload, headers={'X-CSRF-TOKEN':'bad'}).status_code == 403
    assert admin.post('/api/accounts', json={**payload,'password':'short'}).status_code == 422
    assert admin.post('/api/accounts', json={**payload,'employeeId':'missing'}).status_code == 404
    assert admin.post('/api/accounts', json=payload).status_code == 200
    assert admin.post('/api/accounts', json=payload).status_code == 409
    listed = admin.get('/api/accounts').json()
    assert any(a['login']=='new.employee' and a['mustChangePassword'] for a in listed)
    assert 'password_hash' not in str(listed) and payload['password'] not in str(listed)
    with TestClient(app) as e:
        result = sign_in_with(e, payload['login'], payload['password'])
        assert result.json()['session']['mustChangePassword'] is True
        assert e.get('/api/workspace', params={'period':PERIOD}).status_code == 403
        assert e.get('/api/accounts').status_code == 403
        r = e.post('/api/session/change-password', json={'currentPassword':payload['password'], 'newPassword':'personal-password-123'})
        assert r.status_code == 200 and r.json()['session']['mustChangePassword'] is False
        e.headers['X-CSRF-TOKEN'] = r.json()['csrfToken']
        workspace(e)
        assert e.post('/api/accounts', json=payload).status_code == 403
        assert e.post('/api/accounts/reset-password', json={'login':'employee2','password':'temporary-password-456'}).status_code == 403
    db.initialize(path)  # Re-running additive migration must preserve passwords/data.
    with TestClient(app) as e:
        assert sign_in_with(e, payload['login'], 'personal-password-123').status_code == 200


def test_admin_reset_revokes_sessions_and_requires_change(system):
    app, _, admin = system
    login(admin)
    with TestClient(app) as e, TestClient(app) as other:
        login(e, 'employee1'); login(other, 'employee1')
        payload = {'login':'employee1','password':'reset-temporary-123'}
        assert admin.post('/api/accounts/reset-password', json={**payload,'login':'admin'}).status_code == 404
        assert admin.post('/api/accounts/reset-password', json=payload, headers={'X-CSRF-TOKEN':'bad'}).status_code == 403
        assert admin.post('/api/accounts/reset-password', json=payload).status_code == 200
        assert e.get('/api/workspace', params={'period':PERIOD}).status_code == 401
        assert other.get('/api/workspace', params={'period':PERIOD}).status_code == 401
        assert sign_in_with(e, 'employee1', PASSWORD).status_code == 401
        assert sign_in_with(e, 'employee1', payload['password']).json()['session']['mustChangePassword']
        assert e.post('/api/commands', json={'period':PERIOD,'type':'saveDraft','expectedRevision':0,'rows':[]}).status_code == 403
        same = {'currentPassword':payload['password'],'newPassword':payload['password']}
        assert e.post('/api/session/change-password', json=same).status_code == 400
        assert e.post('/api/session/logout', json={}).status_code == 200


def test_password_change_current_password_csrf_and_rotation(system):
    app, _, c = system
    login(c)
    with TestClient(app) as second:
        login(second)
        old = c.cookies.get(auth.COOKIE)
        payload = {'currentPassword':PASSWORD, 'newPassword':'new-personal-password-123'}
        assert c.post('/api/session/change-password', json=payload, headers={'X-CSRF-TOKEN':'wrong'}).status_code == 403
        assert c.post('/api/session/change-password', json={**payload,'currentPassword':'wrong'}).status_code == 400
        result=c.post('/api/session/change-password', json=payload)
        assert result.status_code == 200 and c.cookies.get(auth.COOKIE) != old
        c.headers['X-CSRF-TOKEN'] = result.json()['csrfToken']
        workspace(c)
        assert second.get('/api/workspace', params={'period':PERIOD}).status_code == 401
        assert sign_in_with(second, 'admin', PASSWORD).status_code == 401
        assert sign_in_with(second, 'admin', payload['newPassword']).status_code == 200


def test_delete_floor_removes_assignments_and_persists(system):
    app, path, c = system
    login(c)
    before = workspace(c)
    ok(c, 'deleteFloor', id='f1')
    after = workspace(c)
    assert after['revision'] > before['revision']
    assert not any(f['id']=='f1' for f in after['floors'])
    assert all('f1' not in e['floorIds'] for e in after['employees'])
    assert next(e for e in after['employees'] if e['id']=='e2')['floorIds'] == []
    with db.transaction(path) as con:
        assert con.execute('SELECT 1 FROM floors WHERE id=%s', ('f1',)).fetchone() is None
    with TestClient(create_app(path)) as restart:
        login(restart)
        assert workspace(restart)['floors'] == after['floors']
    assert command(c, 'deleteFloor', id='f1').status_code == 409


@pytest.mark.parametrize('reference', ['draftRows', 'submittedRows', 'shift', 'original'])
def test_delete_floor_checks_other_period_and_preserves_state(system, reference):
    _, path, c = system
    login(c)
    with db.transaction(path, write=True) as con:
        state = db.load(con, '2030-03-01')
        r = row(date='2030-03-03')
        if reference in ('draftRows', 'submittedRows'):
            state['submissions'] = [{'employeeId':'e1', reference:[r]}]
        else:
            state['shifts'] = [{**r, 'employeeId':'e1', 'status':'declined',
                               'floorId':'f2' if reference=='original' else 'f1', 'original':r}]
        db.save(con, state)
    before = workspace(c)
    result = command(c, 'deleteFloor', id='f1')
    assert result.status_code == 409 and '使用中' in result.json()['message']
    assert workspace(c) == before


def test_delete_floor_permissions_csrf_and_stale_revision(system):
    app, _, c = system
    login(c)
    payload={'type':'deleteFloor','id':'f5','period':PERIOD,'expectedRevision':workspace(c)['revision']}
    assert c.post('/api/commands',json=payload,headers={'X-CSRF-TOKEN':'bad'}).status_code == 403
    with TestClient(app) as e:
        login(e,'employee1')
        assert command(e,'deleteFloor',id='f5').status_code == 403
    ok(c,'saveEmployee',employee={'id':'e3','name':'新規','floorIds':['f5']})
    assert c.post('/api/commands',json=payload).status_code == 409
    assert any(f['id']=='f5' for f in workspace(c)['floors'])


def test_delete_employee_revokes_account_sessions_and_persists(system):
    app, path, c = system
    login(c)
    with TestClient(app) as employee:
        login(employee, 'employee2')
        before = workspace(c)
        ok(c, 'deleteEmployee', id='e2')
        after = workspace(c)
        assert after['revision'] > before['revision']
        assert [e['id'] for e in after['employees']] == ['e1']
        assert after['floors'] == before['floors']
        assert employee.get('/api/workspace', params={'period':PERIOD}).status_code == 401
        assert sign_in_with(employee,'employee2',PASSWORD).status_code == 401
        with db.transaction(path) as con:
            assert con.execute('SELECT 1 FROM employees WHERE id=%s', ('e2',)).fetchone() is None
            assert con.execute('SELECT 1 FROM accounts WHERE employee_id=%s', ('e2',)).fetchone() is None
            assert con.execute('SELECT 1 FROM sessions WHERE login=%s', ('employee2',)).fetchone() is None
    with TestClient(create_app(path)) as restart:
        login(restart)
        assert workspace(restart)['employees'] == after['employees']
    assert command(c,'deleteEmployee',id='e2').status_code == 409
    ok(c,'saveEmployee',employee={'id':'noaccount','name':'未登録','floorIds':[]})
    ok(c,'deleteEmployee',id='noaccount')


@pytest.mark.parametrize('kind', ['draft', 'all_off', 'pending', 'confirmed', 'declined'])
def test_delete_employee_rejects_history_in_other_period(system, kind):
    app, path, c = system
    login(c)
    with db.transaction(path, write=True) as con:
        state=db.load(con,'2030-03-01')
        if kind in ('draft','all_off'):
            state['submissions']=[{'employeeId':'e1','draftRows':[], 'submittedRows':[],
                                   'submittedAt':None if kind=='draft' else '2030-03-01T00:00:00Z'}]
        else:
            state['shifts']=[{**row(date='2030-03-03'),'employeeId':'e1','status':kind}]
        db.save(con,state)
    before=workspace(c)
    assert command(c,'deleteEmployee',id='e1').status_code == 409
    assert workspace(c)==before
    with TestClient(app) as employee:
        assert login(employee,'employee1')['employeeId']=='e1'


def test_delete_employee_permissions_csrf_and_revision(system):
    app, _, c=system
    login(c)
    payload={'type':'deleteEmployee','id':'e2','period':PERIOD,'expectedRevision':workspace(c)['revision']}
    assert c.post('/api/commands',json=payload,headers={'X-CSRF-TOKEN':'bad'}).status_code == 403
    with TestClient(app) as employee:
        login(employee,'employee1')
        assert command(employee,'deleteEmployee',id='e2').status_code == 403
    ok(c,'saveEmployee',employee={'id':'e2','name':'変更','floorIds':[]})
    assert c.post('/api/commands',json=payload).status_code == 409
    assert any(e['id']=='e2' for e in workspace(c)['employees'])
