import type { Command, Session, Workspace } from "../domain/model";
export const DEMO = import.meta.env.VITE_DEMO_MODE === "true";
const demo = DEMO ? import("./demo") : null;
let csrf = "";
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
        `通信に失敗しました（${r.status}）。Spring Bootの接続を確認してください。`,
    );
  return json as T;
}
export const api = {
  async session() {
    if (demo) return (await demo).demoSession();
    const r = await request<{ session: Session | null; csrfToken: string }>(
      "/session",
    );
    csrf = r.csrfToken;
    return r.session;
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
    else await request("/session/logout", "POST", {});
  },
  async employee(id: string) {
    if (!demo) throw new Error("従業員認証は未実装です。");
    return (await demo).demoEmployee(id);
  },
  async people() {
    return demo ? (await demo).demoPeople() : [];
  },
  async load(period: string) {
    return demo
      ? (await demo).readDemo(period)
      : request<Workspace>("/workspace?period=" + encodeURIComponent(period));
  },
  async command(period: string, c: Command) {
    if (demo) (await demo).commandDemo(period, c);
    else await request("/commands", "POST", { period, ...c });
  },
};
