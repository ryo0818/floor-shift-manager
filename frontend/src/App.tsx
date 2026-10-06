import { useCallback, useEffect, useRef, useState } from "react";
import {
  Building2,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  Layers3,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { Tabs, TabsList, TabsTrigger } from "./components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./components/ui/table";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "./components/ui/alert-dialog";
import { Picker, EmptyState, CheckBox } from "./components/controls";
import { Timeline } from "./components/timeline";
import { ShiftEditor, MasterEditor } from "./components/editors";
import { api, DEMO } from "./data/api";
import {
  Command,
  Employee,
  Floor,
  Row,
  Session,
  Shift,
  Status,
  Submission,
  Workspace,
  conflicts,
  dayName,
  daysOf,
  duration,
  expired,
  movePeriod,
  periodLabel,
  periodOf,
  shortDate,
  statusNames,
  today,
} from "./domain/model";
const formatDeadline = (d: string | null) =>
  d
    ? new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(d))
    : "未設定";
const jstInput = (d: string | null) =>
  d ? new Date(Date.parse(d) + 9 * 3600000).toISOString().slice(0, 16) : "";
type Confirm = { title: string; text: string; action: () => Promise<void> };
function Brand() {
  return (
    <a href="#" className="brand" onClick={(e) => e.preventDefault()}>
      <span className="brand-mark">
        <Layers3 size={23} />
      </span>
      <span>
        フロアシフト<small>SHIFT MANAGEMENT</small>
      </span>
    </a>
  );
}
function Login({ onLogin }: { onLogin: (s: Session) => void }) {
  const [id, setId] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [people, setPeople] = useState<Employee[]>([]),
    [employee, setEmployee] = useState("e1");
  useEffect(() => {
    api
      .people()
      .then(setPeople)
      .catch(() => {});
  }, []);
  async function login(demo = false) {
    setBusy(true);
    setError("");
    try {
      onLogin(
        await api.login(demo ? "admin" : id, demo ? "demo1234" : password),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <header>
        <Brand />
      </header>
      <main className="login-layout">
        <div className="login-intro">
          <span className="eyebrow">TEAM SCHEDULING</span>
          <h1>
            みんなの希望を、
            <br />
            ひとつのシフトに。
          </h1>
          <p>
            フロアごとの勤務予定を確認して、
            <br />
            希望の受付から確定まで。
          </p>
          <div className="login-feature">
            <Layers3 />
            フロア別に見やすく整理
          </div>
          <div className="login-feature">
            <ClipboardList />
            半月ごとの希望提出
          </div>
          <div className="login-feature">
            <ShieldCheck />
            重複を確認して一括確定
          </div>
        </div>
        <section className="login-card">
          <span className="login-lock">
            <ShieldCheck size={24} />
          </span>
          <h2>{DEMO ? "管理者ログイン" : "ログイン"}</h2>
          <p>
            {DEMO
              ? "管理者アカウントでログインしてください。"
              : "管理者・従業員のIDとパスワードを入力してください。"}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              login();
            }}
            className="edit-form"
          >
            <label>
              ログインID
              <input
                autoComplete="username"
                required
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="ログインID"
              />
            </label>
            <label>
              パスワード
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="パスワード"
              />
            </label>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button className="btn primary" disabled={busy}>
              {busy ? "ログイン中…" : "ログイン"}
            </button>
          </form>
          {DEMO && (
            <div className="demo-entry">
              <p>デモ用アカウント：admin / demo1234</p>
              <button
                className="btn secondary"
                disabled={busy}
                onClick={() => login(true)}
              >
                デモ管理者でログイン
              </button>
              <div className="employee-entry">
                <h3>従業員画面を試す</h3>
                <p>認証方式は未定のため、デモ専用の切り替えです。</p>
                <Picker
                  label="デモ従業員"
                  value={employee}
                  onChange={setEmployee}
                  items={people}
                />
                <button
                  className="btn secondary"
                  disabled={busy || !people.length}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      onLogin(await api.employee(employee));
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  選択した従業員で開く
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
export default function App() {
  const [session, setSession] = useState<Session | null>(null),
    [boot, setBoot] = useState(true),
    [period, setPeriod] = useState(periodOf(today())),
    [data, setData] = useState<Workspace | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("board"),
    [floor, setFloor] = useState("all"),
    [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [confirm, setConfirm] = useState<Confirm | null>(null),
    [editor, setEditor] = useState<{
      row: Row;
      employeeId: string;
      admin: boolean;
    } | null>(null),
    [master, setMaster] = useState<{
      kind: "floor" | "employee";
      floor?: Floor;
      person?: Employee;
    } | null>(null),
    [deadline, setDeadline] = useState(""),
    [rows, setRows] = useState<Row[]>([]),
    [note, setNote] = useState(""),
    [dirty, setDirty] = useState(false),
    [timelineDate, setTimelineDate] = useState(""),
    [boardMode, setBoardMode] = useState("list"),
    [clock, setClock] = useState(Date.now());
  const sequence = useRef(0);
  useEffect(() => {
    api
      .session()
      .then(setSession)
      .catch((e) => setError(e.message))
      .finally(() => setBoot(false));
    const t = setInterval(() => setClock(Date.now()), 10000);
    return () => clearInterval(t);
  }, []);
  const load = useCallback(async () => {
    if (!session) return;
    const seq = ++sequence.current;
    setLoading(true);
    setError("");
    try {
      const d = await api.load(period);
      if (seq !== sequence.current) return;
      setData(d);
      setDeadline(jstInput(d.period.deadline));
      const own = d.submissions.find(
        (s) => s.employeeId === session.employeeId,
      );
      setRows(own?.draftRows || []);
      setNote(own?.draftNote || "");
      setDirty(false);
      setSelected([]);
    } catch (e) {
      if (seq === sequence.current) {
        setData(null);
        setError((e as Error).message);
      }
    } finally {
      if (seq === sequence.current) setLoading(false);
    }
  }, [session, period]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  const login = (s: Session) => {
    setSession(s);
    setPeriod(
      s.role === "employee" && DEMO
        ? movePeriod(periodOf(today()), 1)
        : periodOf(today()),
    );
    setTab("board");
    setError("");
  };
  const run = async (c: Command, msg = "保存しました") => {
    setBusy(true);
    setError("");
    try {
      await api.command(period, c);
      await load();
      toast.success(msg);
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  };
  const safe = (f: () => Promise<unknown>) => {
    void f().catch(() => {});
  };
  function guard(action: () => void) {
    if (dirty)
      setConfirm({
        title: "未保存の変更があります",
        text: "この画面の変更を破棄して移動しますか？ 下書き保存済みの内容は残ります。",
        action: async () => {
          setDirty(false);
          action();
        },
      });
    else action();
  }
  function changePeriod(id: string) {
    guard(() => {
      setData(null);
      setPeriod(id);
      setSelected([]);
    });
  }
  function newRow(date?: string): Row {
    return {
      id: crypto.randomUUID(),
      date: date || data!.period.start,
      start: "09:00",
      end: "17:00",
      floorId:
        (floor !== "all" && data!.floors.some((f) => f.id === floor)
          ? floor
          : data!.floors[0]?.id) || "",
      note: "",
    };
  }
  const requestStatus = (ids: string[], status: Status) =>
    setConfirm({
      title:
        status === "confirmed"
          ? `${ids.length}件を確定しますか？`
          : status === "declined"
            ? "見送りにしますか？"
            : "未確定に戻しますか？",
      text:
        status === "confirmed"
          ? "重複がある場合は、対象全件の確定を中止します。"
          : status === "declined"
            ? "希望は削除せず、見送りとして残します。"
            : "修正後に、改めて確定してください。",
      action: async () => {
        await run(
          { type: "setStatus", ids, status },
          "ステータスを変更しました",
        );
      },
    });
  if (boot)
    return <div className="page-loading">ログイン状態を確認しています…</div>;
  return (
    <>
      <Toaster richColors position="top-center" />
      {DEMO && (
        <div className="demo-banner">
          操作確認用デモ · データは架空です。再読み込みで初期状態に戻ります。
        </div>
      )}
      {!session ? (
        <>
          <Login onLogin={login} />
          {error && (
            <p className="form-error boot-error" role="alert">
              {error}
            </p>
          )}
        </>
      ) : (
        <div className="app">
          <header className="header">
            <Brand />
            <div className="header-right">
              <span className="role-label">
                {session.role === "admin" ? "管理者" : session.name}
              </span>
              <button
                className="btn secondary"
                disabled={busy}
                onClick={() =>
                  guard(() =>
                    safe(async () => {
                      setBusy(true);
                      try {
                        await api.logout();
                        sequence.current++;
                        setSession(null);
                        setData(null);
                        setError("");
                      } finally {
                        setBusy(false);
                      }
                    }),
                  )
                }
              >
                <LogOut size={16} />
                ログアウト
              </button>
            </div>
          </header>
          <main className={session.role === "employee" ? "employee-main" : ""}>
            <div className="page-heading">
              <div>
                <div className="eyebrow">
                  {session.role === "admin" ? "MANAGEMENT" : "MY AVAILABILITY"}
                </div>
                <h1>
                  {session.role === "admin"
                    ? {
                        board: "シフトボード",
                        submissions: "提出状況・締切",
                        members: "従業員・フロア",
                      }[tab]
                    : "希望シフト"}
                </h1>
                <p>
                  {session.role === "admin"
                    ? "希望を確認して、フロアごとの予定を確定。"
                    : "勤務できる日と時間を、半月ごとに提出。"}
                </p>
              </div>
              {session.role === "admin" && tab === "board" && (
                <button
                  className="btn primary"
                  disabled={
                    busy || !data?.employees.length || !data?.floors.length
                  }
                  onClick={() =>
                    setEditor({
                      row: newRow(),
                      employeeId: data!.employees[0].id,
                      admin: true,
                    })
                  }
                >
                  <Plus size={18} />
                  シフトを追加
                </button>
              )}
            </div>
            {session.role === "admin" && (
              <Tabs
                value={tab}
                onValueChange={(v) => {
                  setTab(v);
                  setSelected([]);
                }}
              >
                <TabsList className="main-tabs">
                  <TabsTrigger value="board">
                    <CalendarDays size={16} />
                    シフト管理
                  </TabsTrigger>
                  <TabsTrigger value="submissions">
                    <ClipboardList size={16} />
                    提出状況・締切
                  </TabsTrigger>
                  <TabsTrigger value="members">
                    <Users size={16} />
                    従業員・フロア
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            )}
            <div className="period-toolbar">
              <div className="arrows">
                <button
                  aria-label="前の半月"
                  disabled={busy}
                  onClick={() => changePeriod(movePeriod(period, -1))}
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  aria-label="次の半月"
                  disabled={busy}
                  onClick={() => changePeriod(movePeriod(period, 1))}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
              <input
                type="month"
                aria-label="対象月"
                value={period.slice(0, 7)}
                disabled={busy}
                onChange={(e) => {
                  if (/^\d{4}-\d{2}$/.test(e.target.value))
                    changePeriod(e.target.value + period.slice(7));
                }}
              />
              <div className="half-select">
                <Picker
                  label="前半・後半"
                  value={period.slice(8)}
                  onChange={(v) => changePeriod(period.slice(0, 8) + v)}
                  items={[
                    { id: "01", name: "前半 1〜15日" },
                    { id: "16", name: "後半 16〜末日" },
                  ]}
                />
              </div>
              <button
                className="icon-btn"
                aria-label="再読み込み"
                disabled={busy || loading}
                onClick={() => guard(() => safe(load))}
              >
                <RefreshCw size={17} />
              </button>
            </div>
            {error && (
              <div className="error-panel" role="alert">
                <strong>操作を完了できませんでした</strong>
                <p>{error}</p>
                <button
                  className="icon-btn"
                  aria-label="エラーを閉じる"
                  onClick={() => setError("")}
                >
                  <X size={18} />
                </button>
              </div>
            )}
            {loading ? (
              <div className="page-loading">シフトを読み込んでいます…</div>
            ) : !data ? (
              <EmptyState title="データを読み込めませんでした">
                <button className="btn secondary" onClick={() => safe(load)}>
                  再試行
                </button>
              </EmptyState>
            ) : session.role === "admin" ? (
              <>
                {tab === "board" &&
                  (() => {
                    const visible = data.shifts
                      .filter(
                        (s) =>
                          (floor === "all" || s.floorId === floor) &&
                          (filter === "all" || s.status === filter) &&
                          (!search ||
                            data.employees
                              .find((e) => e.id === s.employeeId)
                              ?.name.includes(search)),
                      )
                      .sort(
                        (a, b) =>
                          a.date.localeCompare(b.date) ||
                          a.start.localeCompare(b.start),
                      );
                    const pending = visible.filter(
                      (s) => s.status === "pending",
                    );
                    const confirmed = data.shifts.filter(
                      (s) =>
                        s.status === "confirmed" &&
                        (floor === "all" || s.floorId === floor),
                    );
                    const name = (id: string) =>
                      data.employees.find((e) => e.id === id)?.name || "未登録";
                    const canConfirm =
                      data.policy.allowEarlyConfirm ||
                      Boolean(
                        data.period.deadline && expired(data.period, clock),
                      );
                    const cell = (s: Shift) => (
                      <>
                        <div className="row-time">
                          {s.start}–{s.end}
                        </div>
                        <span className={`status ${s.status}`}>
                          {statusNames[s.status]}
                        </span>
                      </>
                    );
                    return (
                      <>
                        <div className="summary">
                          <div>
                            <span className="summary-icon">
                              <Users size={20} />
                            </span>
                            <div>
                              <span className="metric-label">
                                確定済みの従業員
                              </span>
                              <strong>
                                {
                                  new Set(confirmed.map((s) => s.employeeId))
                                    .size
                                }
                                <small>人</small>
                              </strong>
                            </div>
                          </div>
                          <div>
                            <span className="summary-icon">
                              <Clock3 size={20} />
                            </span>
                            <div>
                              <span className="metric-label">
                                確定シフト時間
                              </span>
                              <strong>
                                {confirmed.reduce((a, s) => a + duration(s), 0)}
                                <small>時間</small>
                              </strong>
                            </div>
                          </div>
                          <div>
                            <span className="summary-icon">
                              <ClipboardList size={20} />
                            </span>
                            <div>
                              <span className="metric-label">
                                表示中の未確定
                              </span>
                              <strong>
                                {pending.length}
                                <small>件</small>
                              </strong>
                            </div>
                          </div>
                        </div>
                        <section className="board">
                          <div className="board-top">
                            <div>
                              <h2>{periodLabel(data.period)}</h2>
                              <p>
                                {shortDate(data.period.start)}〜
                                {shortDate(data.period.end)} · 締切{" "}
                                {formatDeadline(data.period.deadline)}
                              </p>
                            </div>
                            <Tabs
                              value={boardMode}
                              onValueChange={setBoardMode}
                            >
                              <TabsList>
                                <TabsTrigger value="list">一覧</TabsTrigger>
                                <TabsTrigger value="grid">半月表</TabsTrigger>
                                <TabsTrigger value="timeline">
                                  日別タイムライン
                                </TabsTrigger>
                              </TabsList>
                            </Tabs>
                          </div>
                          <div className="floor-bar">
                            <div className="floor-buttons">
                              <button
                                className={floor === "all" ? "active" : ""}
                                onClick={() => {
                                  setFloor("all");
                                  setSelected([]);
                                }}
                              >
                                <Layers3 size={15} />
                                すべて
                              </button>
                              {data.floors.map((f) => (
                                <button
                                  key={f.id}
                                  className={floor === f.id ? "active" : ""}
                                  onClick={() => {
                                    setFloor(f.id);
                                    setSelected([]);
                                  }}
                                >
                                  <span
                                    className="floor-dot"
                                    style={{ background: f.color }}
                                  />
                                  {f.name}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="filter-row">
                            <input
                              aria-label="従業員名で検索"
                              placeholder="従業員名で検索"
                              value={search}
                              onChange={(e) => {
                                setSearch(e.target.value);
                                setSelected([]);
                              }}
                            />
                            <Picker
                              value={filter}
                              onChange={(v) => {
                                setFilter(v);
                                setSelected([]);
                              }}
                              label="ステータス"
                              items={[
                                { id: "all", name: "すべての状態" },
                                ...Object.entries(statusNames).map(
                                  ([id, name]) => ({ id, name }),
                                ),
                              ]}
                            />
                          </div>
                          {boardMode !== "timeline" && (
                            <div className="bulk-bar">
                              <CheckBox
                                label="表示中の未確定を全選択"
                                checked={
                                  pending.length > 0 &&
                                  pending.every((s) => selected.includes(s.id))
                                }
                                disabled={busy || !pending.length}
                                onChange={() =>
                                  setSelected(
                                    pending.every((s) =>
                                      selected.includes(s.id),
                                    )
                                      ? []
                                      : pending.map((s) => s.id),
                                  )
                                }
                              />
                              <div>
                                <span>{selected.length}件選択</span>
                                <button
                                  className="btn primary"
                                  disabled={
                                    busy || !selected.length || !canConfirm
                                  }
                                  onClick={() =>
                                    requestStatus(selected, "confirmed")
                                  }
                                >
                                  <Check size={16} />
                                  まとめて確定
                                </button>
                              </div>
                            </div>
                          )}
                          {!canConfirm && (
                            <p className="policy-note">
                              仮ルール：確定は提出締切後に行います。締切前の確定可否は要件未定です。
                            </p>
                          )}
                          {boardMode === "timeline" ? (
                            <Timeline
                              data={data}
                              visible={visible}
                              floor={floor}
                              date={timelineDate}
                              onDate={setTimelineDate}
                              busy={busy}
                              canConfirm={canConfirm}
                              onEdit={(s) =>
                                setEditor({
                                  row: s,
                                  employeeId: s.employeeId,
                                  admin: true,
                                })
                              }
                              onStatus={requestStatus}
                            />
                          ) : !visible.length ? (
                            <EmptyState title="該当するシフトはありません">
                              <p>
                                期間・フロア・状態を変更するか、シフトを追加してください。
                              </p>
                            </EmptyState>
                          ) : boardMode === "grid" ? (
                            <div className="grid-wrap">
                              <Table className="period-table">
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>従業員</TableHead>
                                    {daysOf(data.period).map((d) => (
                                      <TableHead key={d}>
                                        {shortDate(d)}
                                        <small>{dayName(d)}</small>
                                      </TableHead>
                                    ))}
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {data.employees
                                    .filter((e) =>
                                      visible.some(
                                        (s) => s.employeeId === e.id,
                                      ),
                                    )
                                    .map((e) => (
                                      <TableRow key={e.id}>
                                        <TableCell>{e.name}</TableCell>
                                        {daysOf(data.period).map((d) => (
                                          <TableCell key={d}>
                                            {visible
                                              .filter(
                                                (s) =>
                                                  s.employeeId === e.id &&
                                                  s.date === d,
                                              )
                                              .map((s) => (
                                                <button
                                                  className={`grid-shift ${s.status}`}
                                                  key={s.id}
                                                  onClick={() => {
                                                    setBoardMode("list");
                                                    setSearch(e.name);
                                                    setSelected([]);
                                                  }}
                                                >
                                                  <small>
                                                    {
                                                      data.floors.find(
                                                        (f) =>
                                                          f.id === s.floorId,
                                                      )?.name
                                                    }
                                                  </small>
                                                  {cell(s)}
                                                </button>
                                              ))}
                                          </TableCell>
                                        ))}
                                      </TableRow>
                                    ))}
                                </TableBody>
                              </Table>
                            </div>
                          ) : (
                            <div className="floor-sections">
                              {data.floors
                                .filter((f) =>
                                  visible.some((s) => s.floorId === f.id),
                                )
                                .map((f) => (
                                  <section key={f.id} className="floor-section">
                                    <div className="floor-heading">
                                      <div>
                                        <span
                                          className="floor-badge"
                                          style={{
                                            color: f.color,
                                            background: f.color + "15",
                                          }}
                                        >
                                          <Building2 size={18} />
                                        </span>
                                        <h3>{f.name}</h3>
                                        <span className="count">
                                          {
                                            visible.filter(
                                              (s) => s.floorId === f.id,
                                            ).length
                                          }
                                          件
                                        </span>
                                      </div>
                                    </div>
                                    <Table className="admin-table">
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead />
                                          <TableHead>従業員 / 日付</TableHead>
                                          <TableHead>勤務時間</TableHead>
                                          <TableHead>状態</TableHead>
                                          <TableHead>メモ / 元の希望</TableHead>
                                          <TableHead>操作</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {visible
                                          .filter((s) => s.floorId === f.id)
                                          .map((s) => (
                                            <TableRow
                                              key={s.id}
                                              className={
                                                s.status === "declined"
                                                  ? "muted-row"
                                                  : ""
                                              }
                                            >
                                              <TableCell>
                                                <input
                                                  type="checkbox"
                                                  aria-label={`${name(s.employeeId)} ${s.date} ${s.start} ${f.name}を選択`}
                                                  checked={selected.includes(
                                                    s.id,
                                                  )}
                                                  disabled={
                                                    busy ||
                                                    s.status !== "pending"
                                                  }
                                                  onChange={() =>
                                                    setSelected(
                                                      selected.includes(s.id)
                                                        ? selected.filter(
                                                            (x) => x !== s.id,
                                                          )
                                                        : [...selected, s.id],
                                                    )
                                                  }
                                                />
                                              </TableCell>
                                              <TableCell>
                                                <strong>
                                                  {name(s.employeeId)}
                                                </strong>
                                                <small>
                                                  {shortDate(s.date)}（
                                                  {dayName(s.date)}）
                                                </small>
                                              </TableCell>
                                              <TableCell>
                                                <strong className="row-time">
                                                  {s.start}–{s.end}
                                                </strong>
                                                <small>{duration(s)}時間</small>
                                              </TableCell>
                                              <TableCell>
                                                <span
                                                  className={`status ${s.status}`}
                                                >
                                                  {statusNames[s.status]}
                                                </span>
                                              </TableCell>
                                              <TableCell className="note-cell">
                                                {s.note || "—"}
                                                {(s.original.date !== s.date ||
                                                  s.original.start !==
                                                    s.start ||
                                                  s.original.end !== s.end ||
                                                  s.original.floorId !==
                                                    s.floorId ||
                                                  s.original.note !==
                                                    s.note) && (
                                                  <details>
                                                    <summary>元の希望</summary>
                                                    {shortDate(
                                                      s.original.date,
                                                    )}{" "}
                                                    {s.original.start}–
                                                    {s.original.end}
                                                    <br />
                                                    {
                                                      data.floors.find(
                                                        (f) =>
                                                          f.id ===
                                                          s.original.floorId,
                                                      )?.name
                                                    }
                                                    <br />
                                                    {s.original.note}
                                                  </details>
                                                )}
                                              </TableCell>
                                              <TableCell>
                                                <div className="row-actions">
                                                  {s.status === "pending" ? (
                                                    <>
                                                      <button
                                                        className="action-confirm"
                                                        disabled={
                                                          busy || !canConfirm
                                                        }
                                                        onClick={() =>
                                                          requestStatus(
                                                            [s.id],
                                                            "confirmed",
                                                          )
                                                        }
                                                      >
                                                        確定
                                                      </button>
                                                      <button
                                                        disabled={busy}
                                                        onClick={() =>
                                                          requestStatus(
                                                            [s.id],
                                                            "declined",
                                                          )
                                                        }
                                                      >
                                                        見送り
                                                      </button>
                                                      <button
                                                        className="icon-btn"
                                                        aria-label={`${name(s.employeeId)}のシフトを編集`}
                                                        disabled={busy}
                                                        onClick={() =>
                                                          setEditor({
                                                            row: s,
                                                            employeeId:
                                                              s.employeeId,
                                                            admin: true,
                                                          })
                                                        }
                                                      >
                                                        <Pencil size={15} />
                                                      </button>
                                                      <button
                                                        className="icon-btn"
                                                        aria-label={`${name(s.employeeId)}のシフトを削除`}
                                                        disabled={busy}
                                                        onClick={() =>
                                                          setConfirm({
                                                            title:
                                                              "シフトを削除しますか？",
                                                            text: `${name(s.employeeId)} ${s.date} ${s.start}–${s.end}。元の提出内容は記録に残ります。`,
                                                            action: () =>
                                                              run(
                                                                {
                                                                  type: "deleteShift",
                                                                  id: s.id,
                                                                },
                                                                "削除しました",
                                                              ),
                                                          })
                                                        }
                                                      >
                                                        <Trash2 size={15} />
                                                      </button>
                                                    </>
                                                  ) : (
                                                    <button
                                                      disabled={busy}
                                                      onClick={() =>
                                                        requestStatus(
                                                          [s.id],
                                                          "pending",
                                                        )
                                                      }
                                                    >
                                                      未確定に戻す
                                                    </button>
                                                  )}
                                                </div>
                                              </TableCell>
                                            </TableRow>
                                          ))}
                                      </TableBody>
                                    </Table>
                                  </section>
                                ))}
                            </div>
                          )}
                          <div className="board-footer">
                            <span>日本時間（JST）・休憩を含むシフト時間</span>
                            <span>確定済みは未確定に戻してから編集</span>
                          </div>
                        </section>
                      </>
                    );
                  })()}
                {tab === "submissions" && (
                  <>
                    <section className="deadline-card">
                      <div>
                        <span className="eyebrow">SUBMISSION DEADLINE</span>
                        <h2>{periodLabel(data.period)}の提出締切</h2>
                        <p>
                          {data.period.deadline
                            ? expired(data.period, clock)
                              ? "受付終了 · 変更は管理者のみ可能"
                              : "受付中 · 従業員は修正・再提出できます"
                            : "締切を設定すると受付を開始できます。"}
                        </p>
                      </div>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          safe(() =>
                            run(
                              {
                                type: "setDeadline",
                                deadline: new Date(
                                  deadline + ":00+09:00",
                                ).toISOString(),
                              },
                              "締切を設定しました",
                            ),
                          );
                        }}
                      >
                        <label>
                          締切日時（日本時間）
                          <input
                            type="datetime-local"
                            required
                            value={deadline}
                            onChange={(e) => setDeadline(e.target.value)}
                          />
                        </label>
                        <button className="btn primary" disabled={busy}>
                          締切を保存
                        </button>
                      </form>
                    </section>
                    <section className="board">
                      <div className="board-top">
                        <h2>提出状況</h2>
                        <span className="counter">
                          {data.submissions.filter((s) => s.submittedAt).length}{" "}
                          / {data.employees.length}人 提出済み
                        </span>
                      </div>
                      <Table className="submission-table">
                        <TableHeader>
                          <TableRow>
                            <TableHead>従業員</TableHead>
                            <TableHead>フロア</TableHead>
                            <TableHead>提出状況</TableHead>
                            <TableHead>提出日時</TableHead>
                            <TableHead>提出全体のメモ</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.employees.map((e) => {
                            const s = data.submissions.find(
                              (x) => x.employeeId === e.id,
                            );
                            return (
                              <TableRow key={e.id}>
                                <TableCell>
                                  <strong>{e.name}</strong>
                                </TableCell>
                                <TableCell>
                                  {e.floorIds
                                    .map(
                                      (id) =>
                                        data.floors.find((f) => f.id === id)
                                          ?.name,
                                    )
                                    .join(" / ") || "未割り当て"}
                                </TableCell>
                                <TableCell>
                                  <span
                                    className={`status ${s?.submittedAt ? "confirmed" : "pending"}`}
                                  >
                                    {s?.submittedAt ? "提出済み" : "未提出"}
                                  </span>
                                  {s?.submittedAt &&
                                    !s.submittedRows.length && (
                                      <small>全日休み希望</small>
                                    )}
                                </TableCell>
                                <TableCell>
                                  {s?.submittedAt
                                    ? formatDeadline(s.submittedAt)
                                    : "—"}
                                </TableCell>
                                <TableCell className="note-cell">
                                  {s?.submittedNote || "—"}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </section>
                  </>
                )}
                {tab === "members" && (
                  <div className="masters">
                    <section className="board floor-master">
                      <div className="board-top">
                        <h2>
                          フロア <small>{data.floors.length}件</small>
                        </h2>
                        <button
                          className="text-btn"
                          onClick={() => setMaster({ kind: "floor" })}
                        >
                          <Plus size={16} />
                          追加
                        </button>
                      </div>
                      {data.floors.map((f) => (
                        <div className="management-row" key={f.id}>
                          <span>
                            <span
                              className="floor-dot"
                              style={{ background: f.color }}
                            />
                            {f.name}
                          </span>
                          <button
                            className="icon-btn"
                            aria-label={`${f.name}を編集`}
                            onClick={() =>
                              setMaster({ kind: "floor", floor: f })
                            }
                          >
                            <Pencil size={16} />
                          </button>
                        </div>
                      ))}
                    </section>
                    <section className="board">
                      <div className="board-top">
                        <h2>
                          従業員 <small>{data.employees.length}人</small>
                        </h2>
                        <button
                          className="btn primary"
                          onClick={() => setMaster({ kind: "employee" })}
                        >
                          <Plus size={16} />
                          従業員を追加
                        </button>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>氏名</TableHead>
                            <TableHead>勤務可能フロア</TableHead>
                            <TableHead />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.employees.map((e) => (
                            <TableRow key={e.id}>
                              <TableCell>{e.name}</TableCell>
                              <TableCell>
                                <div className="assignment-chips">
                                  {e.floorIds.map((id) => (
                                    <span key={id}>
                                      {
                                        data.floors.find((f) => f.id === id)
                                          ?.name
                                      }
                                    </span>
                                  ))}
                                  {!e.floorIds.length && (
                                    <span className="unassigned">
                                      未割り当て
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <button
                                  className="icon-btn"
                                  aria-label={`${e.name}を編集`}
                                  onClick={() =>
                                    setMaster({ kind: "employee", person: e })
                                  }
                                >
                                  <Pencil size={16} />
                                </button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </section>
                  </div>
                )}
              </>
            ) : (
              <>
                {(() => {
                  const s = data.submissions.find(
                    (s) => s.employeeId === session.employeeId,
                  );
                  const locked = expired(data.period, clock);
                  const openEditor = (r: Row) =>
                    setEditor({
                      row: r,
                      employeeId: session.employeeId!,
                      admin: false,
                    });
                  const saveDraft = async () => {
                    await run(
                      { type: "saveDraft", rows, note },
                      "下書きを保存しました",
                    );
                  };
                  return (
                    <>
                      <div
                        className={`employee-status ${locked ? "closed" : ""}`}
                      >
                        <div>
                          <span
                            className={`status ${locked ? "declined" : "confirmed"}`}
                          >
                            {!data.period.deadline
                              ? "受付準備中"
                              : locked
                                ? "受付終了"
                                : "受付中"}
                          </span>
                          <strong>{periodLabel(data.period)}</strong>
                        </div>
                        <p>
                          提出締切：{formatDeadline(data.period.deadline)}
                          （日本時間）
                        </p>
                        <small>
                          {locked
                            ? "変更が必要な場合は管理者にご相談ください。"
                            : "空欄の日は休み希望になります。締切前は再提出できます。"}
                        </small>
                      </div>
                      <div className="submission-info">
                        <span
                          className={`status ${s?.submittedAt ? "confirmed" : "pending"}`}
                        >
                          {s?.submittedAt ? "提出済み" : "未提出"}
                        </span>
                        <span>
                          {s?.submittedAt
                            ? `最終提出 ${formatDeadline(s.submittedAt)}`
                            : "入力後に「提出する」を押してください。"}
                        </span>
                        {(dirty || s?.dirty) && (
                          <span className="draft-indicator">
                            {dirty
                              ? "未保存の変更あり"
                              : "下書きに未提出の変更あり"}
                          </span>
                        )}
                      </div>
                      {!data.floors.length && (
                        <div className="warning">
                          勤務可能フロアが未設定です。管理者に割り当てを依頼してください。
                        </div>
                      )}
                      <section className="employee-days">
                        {daysOf(data.period).map((d) => (
                          <article className="day-card" key={d}>
                            <div className="day-heading">
                              <h2>
                                {shortDate(d)}{" "}
                                <span
                                  className={
                                    dayName(d) === "日" ? "sunday" : ""
                                  }
                                >
                                  {dayName(d)}
                                </span>
                              </h2>
                              <button
                                className="text-btn"
                                disabled={locked || busy || !data.floors.length}
                                onClick={() => openEditor(newRow(d))}
                              >
                                <Plus size={16} />
                                時間帯を追加
                              </button>
                            </div>
                            {rows
                              .filter((r) => r.date === d)
                              .sort((a, b) => a.start.localeCompare(b.start))
                              .map((r) => (
                                <div className="request-row" key={r.id}>
                                  <div>
                                    <strong>
                                      {r.start}–{r.end}
                                    </strong>
                                    <span>
                                      {data.floors.find(
                                        (f) => f.id === r.floorId,
                                      )?.name || "割り当て外（要確認）"}
                                    </span>
                                    {r.note && <p>{r.note}</p>}
                                  </div>
                                  <div>
                                    <button
                                      className="icon-btn"
                                      aria-label={`${shortDate(d)} ${r.start}の希望を編集`}
                                      disabled={locked || busy}
                                      onClick={() => openEditor(r)}
                                    >
                                      <Pencil size={16} />
                                    </button>
                                    <button
                                      className="icon-btn"
                                      aria-label={`${shortDate(d)} ${r.start}の希望を削除`}
                                      disabled={locked || busy}
                                      onClick={() =>
                                        setConfirm({
                                          title: "希望シフトを削除しますか？",
                                          text: `${shortDate(d)} ${r.start}–${r.end}。削除後は下書き保存・再提出してください。`,
                                          action: async () => {
                                            if (expired(data.period))
                                              throw new Error(
                                                "受付が終了しています。",
                                              );
                                            setRows(
                                              rows.filter((x) => x.id !== r.id),
                                            );
                                            setDirty(true);
                                          },
                                        })
                                      }
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            {!rows.some((r) => r.date === d) && (
                              <p className="rest-day">休み希望</p>
                            )}
                          </article>
                        ))}
                      </section>
                      <section className="period-note">
                        <label>
                          半月分のメモ <span>任意</span>
                          <textarea
                            disabled={locked || busy}
                            maxLength={1000}
                            rows={3}
                            placeholder="勤務日数や、期間全体についての希望"
                            value={note}
                            onChange={(e) => {
                              setNote(e.target.value);
                              setDirty(true);
                            }}
                          />
                        </label>
                        <small>{note.length} / 1000文字</small>
                      </section>
                      <div className="employee-sticky">
                        <div>
                          <strong>
                            {new Set(rows.map((r) => r.date)).size}日 /{" "}
                            {rows.length}件
                          </strong>
                          <small>
                            {dirty
                              ? "画面に未保存の変更があります"
                              : "下書きと提出内容は別に保存されます"}
                          </small>
                        </div>
                        <div>
                          <button
                            className="btn secondary"
                            disabled={locked || busy}
                            onClick={() => safe(saveDraft)}
                          >
                            下書き保存
                          </button>
                          <button
                            className="btn primary"
                            disabled={locked || busy}
                            onClick={() => {
                              const pairs = conflicts(rows);
                              setConfirm({
                                title: s?.submittedAt
                                  ? "希望シフトを再提出しますか？"
                                  : "希望シフトを提出しますか？",
                                text:
                                  (rows.length
                                    ? `${rows.length}件を提出します。空欄の日は休み希望です。`
                                    : "すべての日を休み希望として提出します。") +
                                  (pairs.length
                                    ? "\n希望時間の重複があります。確認のうえ、このまま提出します。\n" +
                                      pairs
                                        .map(
                                          ({ a, b }) =>
                                            `${shortDate(a.date)} ${a.start}–${a.end} / ${b.start}–${b.end}`,
                                        )
                                        .join("\n")
                                    : ""),
                                action: async () => {
                                  await run(
                                    { type: "saveDraft", rows, note },
                                    "下書きを保存しました",
                                  );
                                  await run(
                                    {
                                      type: "submit",
                                      acknowledgeOverlap: true,
                                    },
                                    "希望シフトを提出しました",
                                  );
                                },
                              });
                            }}
                          >
                            {s?.submittedAt ? "再提出する" : "提出する"}
                          </button>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </>
            )}
            <footer className="page-footer">
              <span>FLOOR SHIFT</span>
              <span>フロアごとの予定を、ひとつの場所に。</span>
            </footer>
          </main>
        </div>
      )}
      {editor && data && (
        <ShiftEditor
          row={editor.row}
          period={data.period}
          floors={data.floors}
          employees={data.employees}
          employeeId={editor.employeeId}
          existing={
            editor.admin
              ? data.shifts.filter((s) => s.status !== "declined")
              : rows
          }
          admin={editor.admin}
          busy={busy}
          onClose={() => setEditor(null)}
          onSave={async (r, id, ack) => {
            if (editor.admin)
              await run({
                type: "saveShift",
                shift: { ...r, employeeId: id },
                acknowledgeOverlap: ack,
              });
            else {
              if (expired(data.period))
                throw new Error("受付が終了しています。");
              setRows(
                rows.some((x) => x.id === r.id)
                  ? rows.map((x) => (x.id === r.id ? r : x))
                  : [...rows, r],
              );
              setDirty(true);
            }
            setEditor(null);
          }}
        />
      )}
      {master && data && (
        <MasterEditor
          {...master}
          floors={data.floors}
          busy={busy}
          onClose={() => setMaster(null)}
          onSave={async (value) => {
            await run(
              master.kind === "floor"
                ? { type: "saveFloor", floor: value as Floor }
                : { type: "saveEmployee", employee: value as Employee },
            );
            setMaster(null);
          }}
        />
      )}
      <AlertDialog
        open={!!confirm}
        onOpenChange={(v) => {
          if (!v && !busy) setConfirm(null);
        }}
      >
        <AlertDialogContent className="confirmation">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription className="confirmation-text">
              {confirm?.text}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                safe(async () => {
                  try {
                    await confirm?.action();
                    setConfirm(null);
                  } catch (e) {
                    setConfirm(null);
                    setError((e as Error).message);
                  }
                });
              }}
            >
              {busy ? "処理中…" : "実行する"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
