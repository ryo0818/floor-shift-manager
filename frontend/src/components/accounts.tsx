import { useEffect, useState, type FormEvent } from "react";
import { api, type Account } from "../data/api";
import type { Employee, Session } from "../domain/model";
import { Modal } from "./controls";

export function PasswordChange({ forced, onDone, onCancel }: {
  forced: boolean; onDone: (s: Session) => void; onCancel: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); if (busy) return;
    if (password !== repeat) { setError("新しいパスワードが一致しません。"); return; }
    setBusy(true); setError("");
    try { onDone(await api.changePassword(current, password)); }
    catch(e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="password-panel login-card">
    <h2>パスワード変更</h2>
    <p>{forced ? "最初に仮パスワードを変更してください。" : "変更すると、他の端末のログインは解除されます。"}</p>
    <form className="edit-form" onSubmit={submit}>
      <label>現在のパスワード（初回は仮パスワード）<input type="password" autoComplete="current-password" required maxLength={256} value={current} onChange={e=>setCurrent(e.target.value)} /></label>
      <label>新しいパスワード（6〜256文字）<input type="password" autoComplete="new-password" required minLength={6} maxLength={256} value={password} onChange={e=>setPassword(e.target.value)} /></label>
      <label>新しいパスワード（確認）<input type="password" autoComplete="new-password" required minLength={6} maxLength={256} value={repeat} onChange={e=>setRepeat(e.target.value)} /></label>
      {error && <p role="alert" className="form-error">{error}</p>}
      <button className="btn primary" disabled={busy}>変更する</button>
      <button type="button" className="btn secondary" disabled={busy} onClick={onCancel}>{forced ? "ログアウト" : "キャンセル"}</button>
    </form>
  </section>;
}

export function Accounts({ employees, initialEmployeeId, close }: {
  employees: Employee[]; initialEmployeeId?: string; close: () => void;
}) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [target, setTarget] = useState(initialEmployeeId ?? "");
  const [initialPassword, setInitialPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const existing = accounts.find(a => a.employeeId === target);
  const reload = async () => { setAccounts(await api.accounts()); setLoaded(true); };
  useEffect(() => { void reload().catch(e => setError(e.message)); }, []);

  async function issue() {
    if (busy || !target || !loaded) return;
    if (existing && !window.confirm(`${existing.login} のパスワードを再発行します。ログイン中の端末はすべてログアウトします。よろしいですか？`)) return;
    setBusy(true); setError(""); setMessage(""); setInitialPassword("");
    try {
      if (existing) await api.resetPassword(existing.login);
      else await api.createAccount(target);
      setMessage("発行しました。初期パスワードを表示して、ログインIDと一緒に本人に伝えてください。");
      await reload();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function reveal(login: string) {
    setBusy(true); setError(""); setMessage("");
    try { setInitialPassword((await api.initialPassword(login)).initialPassword); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function copy(value: string, label: string) {
    setError(""); setMessage("");
    try {
      await navigator.clipboard.writeText(value);
      setMessage(`${label}をコピーしました。`);
    } catch {
      setError("コピーできませんでした。入力欄の文字を選択してコピーしてください。");
    }
  }

  return <Modal title="ログインアカウント管理" description="ログインIDと初期パスワードを確認できます。本人が変更すると初期パスワードは表示されなくなります。" close={() => { if (!busy) close(); }}>
    <div className="edit-form">
      <label>従業員<select disabled={busy || !loaded} value={target} onChange={e => {
        setTarget(e.target.value); setInitialPassword(""); setMessage(""); setError("");
      }}>
        <option value="">選択してください</option>
        {employees.map(e => <option key={e.id} value={e.id}>{e.name}（{accounts.some(a => a.employeeId === e.id) ? "発行済み" : "未発行"}）</option>)}
      </select></label>
      {target && loaded && <>
        {existing ? <>
          <label>ログインID<input readOnly value={existing.login} onFocus={e => e.target.select()} /></label>
          <button type="button" className="btn secondary" disabled={busy} onClick={() => void copy(existing.login, "ログインID")}>IDをコピー</button>
          <p>{existing.mustChangePassword ? "本人のパスワード変更待ち" : "利用中"}</p>
          {existing.hasInitialPassword && (initialPassword ? <>
            <label>初期パスワード<input readOnly value={initialPassword} onFocus={e => e.target.select()} /></label>
            <button type="button" className="btn secondary" disabled={busy} onClick={() => void copy(initialPassword, "初期パスワード")}>初期パスワードをコピー</button>
            <button type="button" className="btn secondary" onClick={() => setInitialPassword("")}>初期パスワードを隠す</button>
          </> : <button type="button" className="btn secondary" disabled={busy} onClick={() => void reveal(existing.login)}>初期パスワードを表示</button>)}
          <button type="button" className="btn secondary" disabled={busy} onClick={() => void issue()}>パスワードを再発行</button>
        </> : <button type="button" className="btn primary" disabled={busy} onClick={() => void issue()}>アカウントを発行</button>}
      </>}
      {error && <p role="alert" className="form-error">{error}</p>}
      {message && <p role="status">{message}</p>}
    </div>
  </Modal>;
}
