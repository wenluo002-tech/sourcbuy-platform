// M3a 认证核心（2026-11-05）：邮箱+scrypt 密码、httpOnly cookie 会话、库内只存 token 的 sha256
// 安全口径：scrypt 为 node crypto 内置零依赖；token 32 字节随机；会话 30 天滚动过期
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { authSessions, users } from "@db/schema";

export const SESSION_COOKIE = "sb_session";
const SESSION_DAYS = 30;

export type SessionUser = {
  id: number;
  email: string;
  displayName: string | null;
  locale: string | null;
};

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `s1$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [v, salt, hash] = stored.split("$");
  if (v !== "s1" || !salt || !hash) return false;
  const calc = scryptSync(password, salt, 64);
  const want = Buffer.from(hash, "hex");
  return calc.length === want.length && timingSafeEqual(calc, want);
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(userId: number): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await getDb().insert(authSessions).values({ tokenHash: hashToken(token), userId, expiresAt });
  return { token, expiresAt };
}

export async function getSessionUser(token: string | null | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const db = getDb();
  const rows = await db
    .select({ s: authSessions, u: users })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(and(eq(authSessions.tokenHash, hashToken(token)), gt(authSessions.expiresAt, new Date())))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  // 滚动续期：剩余不足一半时顺延（避免每请求写库）
  if (r.s.expiresAt.getTime() - Date.now() < (SESSION_DAYS / 2) * 86400_000) {
    await db.update(authSessions)
      .set({ expiresAt: new Date(Date.now() + SESSION_DAYS * 86400_000), lastSeenAt: new Date() })
      .where(eq(authSessions.id, r.s.id)).catch(() => {});
  }
  return { id: r.u.id, email: r.u.email, displayName: r.u.displayName, locale: r.u.locale };
}

export async function destroySession(token: string | null | undefined): Promise<void> {
  if (!token) return;
  await getDb().delete(authSessions).where(eq(authSessions.tokenHash, hashToken(token))).catch(() => {});
}

// ---- cookie 编解码（fetch adapter 无 cookie 中间件，手写最小集）----
export function readSessionCookie(req: Request): string | null {
  const raw = req.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === SESSION_COOKIE) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export function sessionCookieHeader(token: string, expiresAt: Date, secure: boolean): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}${secure ? "; Secure" : ""}`;
}

// 会话 token 三通道读取（2026-11-09 登录修复）：预览面板是跨站 iframe，Chrome/Safari
// 拦截第三方 cookie——Set-Cookie 明明 200 发出却被浏览器丢弃，用户怎么登录都是匿名。
// 所以登录响应体同时回 token，前端存 localStorage，之后每个请求带 Authorization: Bearer；
// <img>/PDF 这类无法带 header 的直接引用走 ?at= query。cookie 通道保留给正常第一方访问。
export function readSessionToken(req: Request): string | null {
  const c = readSessionCookie(req);
  if (c) return c;
  const h = req.headers.get("authorization");
  if (h?.startsWith("Bearer ")) {
    const t = h.slice(7).trim();
    if (/^[0-9a-f]{64}$/i.test(t)) return t;
  }
  try {
    const at = new URL(req.url).searchParams.get("at");
    if (at && /^[0-9a-f]{64}$/i.test(at)) return at;
  } catch { /* ignore */ }
  return null;
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
