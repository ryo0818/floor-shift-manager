import { useState } from "react";
import {
  minutes,
  headcount,
  daysOf,
  statusNames,
  type Workspace,
  type Shift,
  type Status,
} from "../domain/model";
import { Modal } from "./controls";

export function Timeline({
  data,
  visible,
  floor,
  date,
  onDate,
  busy,
  canConfirm,
  onEdit,
  onStatus,
}: {
  data: Workspace;
  visible: Shift[];
  floor: string;
  date: string;
  onDate: (v: string) => void;
  busy: boolean;
  canConfirm: boolean;
  onEdit: (s: Shift) => void;
  onStatus: (ids: string[], status: Status) => void;
}) {
  const [detail, setDetail] = useState<string | null>(null);
  const days = daysOf(data.period);
  const day = days.includes(date) ? date : days[0];
  const active = data.shifts.find((s) => s.id === detail);
  const name = (id: string) =>
    data.employees.find((e) => e.id === id)?.name || "未登録";
  const action = (ids: string[], status: Status) => {
    setDetail(null);
    onStatus(ids, status);
  };
  return (
    <div className="timeline-view">
      <div className="timeline-toolbar">
        <button
          disabled={days.indexOf(day) === 0}
          onClick={() => onDate(days[days.indexOf(day) - 1])}
        >
          ← 前日
        </button>
        <label>
          表示日{" "}
          <input
            type="date"
            aria-label="タイムラインの日付"
            min={data.period.start}
            max={data.period.end}
            value={day}
            onChange={(e) => {
              if (days.includes(e.target.value)) onDate(e.target.value);
            }}
          />
        </label>
        <button
          disabled={days.indexOf(day) === days.length - 1}
          onClick={() => onDate(days[days.indexOf(day) + 1])}
        >
          翌日 →
        </button>
      </div>
      <p className="timeline-hint">
        横棒をクリックして時間調整・確定。人数は検索・状態の絞り込みに関係なく、当日・当該フロアの全シフトから集計します。時間帯の人数は15分単位です。
      </p>
      <div className="timeline-legend">
        <span className="status pending">未確定</span>
        <span className="status confirmed">確定済み</span>
        <span className="status declined">見送り（人数に含めない）</span>
      </div>
      {data.floors
        .filter((f) => floor === "all" || f.id === floor)
        .map((f) => {
          const all = data.shifts.filter(
            (s) => s.date === day && s.floorId === f.id,
          );
          const confirmed = all.filter((s) => s.status === "confirmed"),
            pending = all.filter((s) => s.status === "pending");
          const shown = visible.filter(
            (s) => s.date === day && s.floorId === f.id,
          );
          const basis = all.length ? all : [];
          const from = basis.length
            ? Math.floor(Math.min(...basis.map((s) => minutes(s.start))) / 60) *
              60
            : 480;
          const to = basis.length
            ? Math.min(
                1440,
                Math.ceil(Math.max(...basis.map((s) => minutes(s.end))) / 60) *
                  60,
              )
            : 1320;
          const span = Math.max(60, to - from),
            slots = Array.from({ length: span / 15 }, (_, i) => from + i * 15);
          const hours = Array.from(
            { length: span / 60 + 1 },
            (_, i) => from + i * 60,
          );
          return (
            <section key={f.id} className="timeline-floor">
              <div className="timeline-floor-title">
                <div>
                  <h3>{f.name}</h3>
                  <p>
                    <strong>確定 {headcount(confirmed)}人</strong> ／ 未確定希望{" "}
                    {headcount(pending)}人 <small>（各区分内で重複除外）</small>
                  </p>
                </div>
                <button
                  className="primary"
                  disabled={
                    busy ||
                    !canConfirm ||
                    !shown.some((s) => s.status === "pending")
                  }
                  onClick={() =>
                    action(
                      shown
                        .filter((s) => s.status === "pending")
                        .map((s) => s.id),
                      "confirmed",
                    )
                  }
                >
                  表示中の未確定をまとめて確定（
                  {shown.filter((s) => s.status === "pending").length}件）
                </button>
              </div>
              <div
                className="timeline-scroll"
                tabIndex={0}
                aria-label={`${f.name} ${day}の勤務時間表`}
              >
                <div
                  className="timeline-canvas"
                  style={{ minWidth: Math.max(1000, (span / 15) * 25) + 160 }}
                >
                  <div className="timeline-line">
                    <div className="timeline-label">従業員 / 時刻</div>
                    <div className="timeline-axis">
                      {hours.map((h, i) => (
                        <span
                          key={h}
                          style={{ left: `${((i * 60) / span) * 100}%` }}
                        >
                          {String(h / 60).padStart(2, "0")}:00
                        </span>
                      ))}
                    </div>
                  </div>
                  {[
                    { label: "確定人数", rows: confirmed, kind: "confirmed" },
                    { label: "未確定希望人数", rows: pending, kind: "pending" },
                  ].map((group) => (
                    <div className="timeline-line" key={group.kind}>
                      <div className="timeline-label">{group.label}</div>
                      <div
                        className="timeline-counts"
                        style={{
                          gridTemplateColumns: `repeat(${slots.length},1fr)`,
                        }}
                      >
                        {slots.map((t) => (
                          <span
                            className={group.kind}
                            key={t}
                            title={`${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}〜 ${headcount(group.rows, t, t + 15)}人`}
                          >
                            {headcount(group.rows, t, t + 15)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                  {data.employees
                    .filter((e) => shown.some((s) => s.employeeId === e.id))
                    .map((e) => {
                      const shifts = shown.filter((s) => s.employeeId === e.id);
                      return (
                        <div className="timeline-line" key={e.id}>
                          <div className="timeline-label">{e.name}</div>
                          <div
                            className="timeline-track"
                            style={{
                              height: shifts.length * 40 + 12,
                              backgroundSize: `${(60 / span) * 100}% 100%`,
                            }}
                          >
                            {shifts.map((s, i) => (
                              <button
                                key={s.id}
                                disabled={busy}
                                className={`timeline-bar ${s.status}`}
                                style={{
                                  left: `${((minutes(s.start) - from) / span) * 100}%`,
                                  width: `${((minutes(s.end) - minutes(s.start)) / span) * 100}%`,
                                  top: i * 40 + 6,
                                }}
                                onClick={() => setDetail(s.id)}
                                aria-label={`${e.name} ${s.start}〜${s.end} ${statusNames[s.status]} 詳細と操作`}
                                title={`${s.start}〜${s.end} ${statusNames[s.status]}`}
                              >
                                <span>
                                  {s.start}–{s.end} · {statusNames[s.status]}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
              {!shown.length && (
                <p className="timeline-hint">
                  この日の表示対象シフトはありません。
                </p>
              )}
            </section>
          );
        })}
      {active && (
        <Modal
          title={`${name(active.employeeId)}のシフト`}
          description={`${active.date} · ${data.floors.find((f) => f.id === active.floorId)?.name}`}
          close={() => setDetail(null)}
        >
          <p className="timeline-detail-time">
            {active.start}–{active.end}
          </p>
          <span className={`status ${active.status}`}>
            {statusNames[active.status]}
          </span>
          <p>{active.note || "メモなし"}</p>
          <div className="timeline-actions">
            {active.status === "pending" ? (
              <>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => {
                    setDetail(null);
                    onEdit(active);
                  }}
                >
                  時間・フロアを調整
                </button>
                <button
                  disabled={busy || !canConfirm}
                  onClick={() => action([active.id], "confirmed")}
                >
                  確定する
                </button>
                <button
                  disabled={busy}
                  onClick={() => action([active.id], "declined")}
                >
                  見送り
                </button>
              </>
            ) : (
              <>
                <p>時間を調整する場合は、未確定に戻してください。</p>
                <button
                  disabled={busy}
                  onClick={() => action([active.id], "pending")}
                >
                  未確定に戻す
                </button>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
