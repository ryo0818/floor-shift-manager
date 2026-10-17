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

export function Accounts({ employees, close }: { employees: Employee[]; close: () => void }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [target, setTarget] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const existing = accounts.find(a=>a.employeeId===target);
  const reload = async () => { setAccounts(await api.accounts()); setLoaded(true); };
  useEffect(()=>{ void reload().catch(e=>setError(e.message)); }, []);
  async function submit(e: FormEvent) {
    e.preventDefault(); if (busy || !loaded) return;
    setError(""); setMessage("");
    if (password !== repeat) { setError("仮パスワードが一致しません。"); return; }
    if (existing && !window.confirm(`${existing.login} のパスワードをリセットします。ログイン中の端末もすべてログアウトします。よろしいですか？`)) return;
    setBusy(true);
    try {
      if (existing) await api.resetPassword(existing.login, password);
      else await api.createAccount(login, target, password);
      setPassword(""); setRepeat("");
      setMessage("設定しました。入力した仮パスワードを本人に伝えてください。本人は次回ログイン時に変更します。");
      await reload();
    } catch(e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <Modal title="ログインアカウント管理" description="従業員のアカウント作成・パスワードリセット" close={()=>{if(!busy) close();}}>
    <form className="edit-form" onSubmit={submit}>
      <label>従業員<select required disabled={busy || !loaded} value={target} onChange={e=>{setTarget(e.target.value);setLogin("");setPassword("");setRepeat("");setMessage("");setError("");}}>
        <option value="">選択してください</option>
        {employees.map(e=><option key={e.id} value={e.id}>{e.name}（{accounts.some(a=>a.employeeId===e.id) ? "登録済み" : "未登録"}）</option>)}
      </select></label>
      {target && <>
        {existing ? <p>ログインID：<strong>{existing.login}</strong> ／ {existing.mustChangePassword ? "本人のパスワード変更待ち" : "利用中"}</p> :
          <label>ログインID<input required pattern="[A-Za-z0-9_.\-]{1,128}" maxLength={128} autoComplete="off" value={login} disabled={busy} onChange={e=>setLogin(e.target.value)} /><small>半角英数字・ハイフン・アンダースコア・ピリオド</small></label>}
        <label>仮パスワード（6〜256文字）<input required type="password" minLength={6} maxLength={256} autoComplete="new-password" disabled={busy} value={password} onChange={e=>setPassword(e.target.value)} /></label>
        <label>仮パスワード（確認）<input required type="password" minLength={6} maxLength={256} autoComplete="new-password" disabled={busy} value={repeat} onChange={e=>setRepeat(e.target.value)} /></label>
        <button className="btn primary" disabled={busy || !loaded}>{existing ? "パスワードをリセット" : "アカウントを作成"}</button>
      </>}
      {error && <p role="alert" className="form-error">{error}</p>}
      {message && <p role="status">{message}</p>}
    </form>
  </Modal>;
}
