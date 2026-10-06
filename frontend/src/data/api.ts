import type { Command, Session, Workspace, Row } from "../domain/model";
export const DEMO = import.meta.env.VITE_DEMO_MODE === "true";
const demo = DEMO ? import("./demo") : null;
let csrf = "";
let sessionRequest: Promise<Session | null> | null = null;
const revisions = new Map<string, number>();
const cleanRow = ({ id, date, start, end, floorId, note }: Row): Row => ({
  id,
  date,
  start,
  end,
  floorId,
  note,
});
async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const r = await fetch("/api" + path, {
    method,
    credentials: "include",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(method !== "GET" && csrf ? { "X-CSRF-TOKEN": csrf } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await r.json().catch(() => null);
  if (!r.ok)
    throw new Error(
      json?.message ||
        json?.error ||
        `通信に失敗しました（${r.status}）。Python APIの接続を確認してください。`,
    );
  return json as T;
}
export const api = {
  async session() {
    if (demo) return (await demo).demoSession();
    if (!sessionRequest) {
      sessionRequest = request<{ session: Session | null; csrfToken: string }>(
        "/session",
      )
        .then((r) => {
          csrf = r.csrfToken;
          return r.session;
        })
        .finally(() => {
          sessionRequest = null;
        });
    }
    return sessionRequest;
  },
  async login(id: string, password: string) {
    if (demo) return (await demo).demoLogin(id, password);
    const r = await request<{ session: Session; csrfToken: string }>(
      "/session/login",
      "POST",
      { id, password },
    );
    csrf = r.csrfToken;
    return r.session;
  },
  async logout() {
    if (demo) (await demo).demoLogout();
    else {
      const r = await request<{ csrfToken: string }>(
        "/session/logout",
        "POST",
        {},
      );
      csrf = r.csrfToken;
      revisions.clear();
    }
  },
  async employee(id: string) {
    if (!demo)
      throw new Error(
        "従業員の切り替えはデモ専用です。ID・パスワードでログインしてください。",
      );
    return (await demo).demoEmployee(id);
  },
  async people() {
    return demo ? (await demo).demoPeople() : [];
  },
  async load(period: string) {
    if (demo) return (await demo).readDemo(period);
    const result = await request<Workspace & { revision: number }>(
      "/workspace?period=" + encodeURIComponent(period),
    );
    revisions.set(period, result.revision);
    return result;
  },
  async command(period: string, c: Command) {
    if (demo) (await demo).commandDemo(period, c);
    else {
      const expectedRevision = revisions.get(period);
      if (expectedRevision === undefined)
        throw new Error("画面を再読み込みしてください。");
      const clean =
        c.type === "saveShift"
          ? {
              ...c,
              shift: { ...cleanRow(c.shift), employeeId: c.shift.employeeId },
            }
          : c.type === "saveDraft"
            ? { ...c, rows: c.rows.map(cleanRow) }
            : c;
      const result = await request<{ revision: number }>("/commands", "POST", {
        period,
        ...clean,
        expectedRevision,
      });
      revisions.set(period, result.revision);
    }
  },
};
