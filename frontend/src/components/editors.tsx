import { useState, type FormEvent } from "react";
import { Clock3 } from "lucide-react";
import {
  Employee,
  Floor,
  Period,
  Row,
  conflicts,
  times,
  validateRow,
} from "../domain/model";
import { CheckBox, Modal, Picker } from "./controls";
export function ShiftEditor({
  row,
  period,
  floors,
  employees,
  employeeId,
  existing,
  admin,
  onSave,
  onClose,
  busy,
}: {
  row: Row;
  period: Period;
  floors: Floor[];
  employees: Employee[];
  employeeId: string;
  existing: (Row & { employeeId?: string })[];
  admin: boolean;
  onSave: (r: Row, id: string, ack: boolean) => Promise<void>;
  onClose: () => void;
  busy: boolean;
}) {
  const [r, setR] = useState(row),
    [person, setPerson] = useState(employeeId),
    [ack, setAck] = useState(false),
    [error, setError] = useState("");
  const available = admin
    ? floors
    : floors.filter((f) =>
        employees.find((e) => e.id === person)?.floorIds.includes(f.id),
      );
  const pairs = conflicts([
    r,
    ...existing.filter(
      (x) => x.id !== r.id && (!admin || x.employeeId === person),
    ),
  ]).filter((x) => x.a.id === r.id || x.b.id === r.id);
  const change = (v: Partial<Row>) => {
    setR({ ...r, ...v });
    setAck(false);
  };
  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      validateRow(
        r,
        period,
        available.map((f) => f.id),
      );
      if (pairs.length && !ack)
        throw new Error("重複内容を確認し、チェックを入れてください。");
      await onSave(r, person, ack);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal
      title={admin ? "シフトを調整" : "希望シフトを入力"}
      description="開始・終了は15分単位です。休憩の入力は不要です。"
      close={() => !busy && onClose()}
    >
      <form onSubmit={save} className="edit-form">
        {admin && (
          <label>
            従業員
            <Picker
              value={person}
              onChange={(v) => {
                setPerson(v);
                setAck(false);
              }}
              items={employees}
              label="従業員"
            />
          </label>
        )}
        <label>
          希望日
          <input
            type="date"
            required
            min={period.start}
            max={period.end}
            value={r.date}
            onChange={(e) => change({ date: e.target.value })}
          />
        </label>
        <label>
          フロア
          <Picker
            value={r.floorId}
            onChange={(v) => change({ floorId: v })}
            items={available}
            label="フロア"
            disabled={!admin && available.length <= 1}
          />
          {!admin && available.length === 1 && (
            <small>割り当てフロアが1つのため変更できません。</small>
          )}
        </label>
        <div className="form-grid">
          <label>
            開始
            <Picker
              label="開始時刻"
              value={r.start}
              onChange={(v) => change({ start: v })}
              items={times.map((t) => ({ id: t, name: t }))}
            />
          </label>
          <label>
            終了
            <Picker
              label="終了時刻"
              value={r.end}
              onChange={(v) => change({ end: v })}
              items={times.map((t) => ({ id: t, name: t }))}
            />
          </label>
        </div>
        <label>
          このシフトのメモ（任意）
          <textarea
            maxLength={500}
            value={r.note}
            rows={3}
            placeholder="時間の調整や担当について"
            onChange={(e) => change({ note: e.target.value })}
          />
        </label>
        {pairs.length > 0 && (
          <div className="warning" role="alert">
            <strong>希望時間が重複しています</strong>
            {pairs.map(({ b }) => (
              <p key={b.id}>
                {floors.find((f) => f.id === b.floorId)?.name} {b.start}–{b.end}
              </p>
            ))}
            <CheckBox
              checked={ack}
              onChange={() => setAck(!ack)}
              label="重複を確認して、このまま保存する"
            />
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button
            type="button"
            className="btn secondary"
            disabled={busy}
            onClick={onClose}
          >
            キャンセル
          </button>
          <button className="btn primary" disabled={busy || !available.length}>
            <Clock3 size={16} />
            {busy ? "保存中…" : "保存する"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function MasterEditor({
  kind,
  person,
  floor,
  floors,
  busy,
  onClose,
  onSave,
}: {
  kind: "employee" | "floor";
  person?: Employee;
  floor?: Floor;
  floors: Floor[];
  busy: boolean;
  onClose: () => void;
  onSave: (value: Employee | Floor) => Promise<void>;
}) {
  const [name, setName] = useState(person?.name || floor?.name || ""),
    [ids, setIds] = useState(person?.floorIds || []),
    [color, setColor] = useState(floor?.color || "#236b59"),
    [error, setError] = useState("");
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("名前を入力してください。");
      return;
    }
    try {
      await onSave(
        kind === "employee"
          ? {
              id: person?.id || crypto.randomUUID(),
              name: name.trim(),
              floorIds: ids,
            }
          : { id: floor?.id || crypto.randomUUID(), name: name.trim(), color },
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal
      title={kind === "employee" ? "従業員を登録・編集" : "フロアを登録・編集"}
      description={
        kind === "employee"
          ? "勤務可能なフロアを複数割り当てられます。"
          : "シフト画面で表示する名前と色を設定します。"
      }
      close={() => !busy && onClose()}
    >
      <form onSubmit={save} className="edit-form">
        <label>
          {kind === "employee" ? "氏名" : "フロア名"}
          <input
            autoFocus
            value={name}
            required
            maxLength={50}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {kind === "floor" ? (
          <label>
            表示色
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </label>
        ) : (
          <fieldset>
            <legend>勤務可能フロア</legend>
            <div className="floor-checks">
              {floors.map((f) => (
                <CheckBox
                  key={f.id}
                  label={f.name}
                  checked={ids.includes(f.id)}
                  onChange={() =>
                    setIds(
                      ids.includes(f.id)
                        ? ids.filter((id) => id !== f.id)
                        : [...ids, f.id],
                    )
                  }
                />
              ))}
            </div>
            {!ids.length && (
              <p className="warning">
                未割り当ての従業員は、希望を追加できません（仮仕様）。
              </p>
            )}
          </fieldset>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="btn secondary"
          >
            キャンセル
          </button>
          <button disabled={busy} className="btn primary">
            保存する
          </button>
        </div>
      </form>
    </Modal>
  );
}
