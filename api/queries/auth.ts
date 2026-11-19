// M3a 账号 + 会话记忆查询层（2026-11-05）
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "./connection";
import { chatMessages, chatThreads, users } from "@db/schema";
import { createSession, hashPassword, verifyPassword, type SessionUser } from "../lib/auth";
import { awardRegisterGift } from "../lib/points";
import { sanitizeSalutation } from "../../contracts/salutation";

const normEmail = (e: string) => e.trim().toLowerCase();

export class AuthError extends Error {
  code: "EMAIL_TAKEN" | "BAD_CREDENTIALS" | "INVALID_INPUT";
  constructor(code: "EMAIL_TAKEN" | "BAD_CREDENTIALS" | "INVALID_INPUT", msg: string) {
    super(msg);
    this.code = code;
  }
}

export async function registerUser(email: string, password: string, displayName?: string, locale?: string) {
  const db = getDb();
  const em = normEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em) || em.length > 191) throw new AuthError("INVALID_INPUT", "invalid email");
  if (password.length < 8 || password.length > 72) throw new AuthError("INVALID_INPUT", "password must be 8-72 chars");
  const dup = await db.select({ id: users.id }).from(users).where(eq(users.email, em)).limit(1);
  if (dup.length) throw new AuthError("EMAIL_TAKEN", "email already registered");
  const r = await db.insert(users).values({
    email: em, passwordHash: hashPassword(password),
    displayName: displayName?.trim().slice(0, 64) || null,
    locale: ["zh", "en", "es", "fr", "pt", "ka"].includes(locale ?? "") ? locale! : null,
  });
  const userId = Number(r[0].insertId);
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
  await awardRegisterGift(userId, em); // P4 注册礼 1,000 分（测试号自动跳过，失败不阻塞注册）
  const { token, expiresAt } = await createSession(userId);
  return { user: { id: userId, email: em, displayName: displayName ?? null, locale: locale ?? null } as SessionUser, token, expiresAt };
}

export async function loginUser(email: string, password: string) {
  const db = getDb();
  const em = normEmail(email);
  const rows = await db.select().from(users).where(eq(users.email, em)).limit(1);
  const u = rows[0];
  // 统一报错文案，不泄露邮箱是否注册过
  if (!u || !verifyPassword(password, u.passwordHash)) throw new AuthError("BAD_CREDENTIALS", "wrong email or password");
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, u.id));
  const { token, expiresAt } = await createSession(u.id);
  return { user: { id: u.id, email: u.email, displayName: u.displayName, locale: u.locale } as SessionUser, token, expiresAt };
}

// V105 称谓：displayName 即"买家希望被如何称呼"。读取时过 sanitizeSalutation——
// 注册时填的 displayName 可能不合称谓规范（emoji/超长），注入话术前必须防呆
export async function getUserSalutation(userId: number): Promise<string | null> {
  const db = getDb();
  const rows = await db.select({ displayName: users.displayName }).from(users).where(eq(users.id, userId)).limit(1);
  return sanitizeSalutation(rows[0]?.displayName);
}

// 写入称谓（聊天中告知 / 后台修改同一条路径）；name 必须已过 sanitizeSalutation，null=清除
export async function updateUserSalutation(userId: number, name: string | null): Promise<void> {
  const db = getDb();
  await db.update(users).set({ displayName: name }).where(eq(users.id, userId));
}

// 登录/注册后把匿名期会话并到账号下——对话跟着人走
export async function claimAnonThreads(anonId: string | undefined, userId: number) {
  if (!anonId || !/^[0-9a-f-]{36}$/i.test(anonId)) return;
  await getDb().update(chatThreads).set({ userId })
    .where(and(eq(chatThreads.anonId, anonId), isNull(chatThreads.userId))).catch(() => {});
}

// ---- 会话落库与回放 ----
export async function ensureThread(opts: { threadId?: number; anonId?: string; userId?: number | null; locale?: string; firstMessage?: string }) {
  const db = getDb();
  if (opts.threadId) {
    const rows = await db.select().from(chatThreads).where(eq(chatThreads.id, opts.threadId)).limit(1);
    const t = rows[0];
    // 归属校验：本人的、或自己匿名期未认领的，才允许续写
    if (t && (t.userId === opts.userId || (!t.userId && opts.anonId && t.anonId === opts.anonId))) {
      if (opts.userId && !t.userId) await db.update(chatThreads).set({ userId: opts.userId }).where(eq(chatThreads.id, t.id)).catch(() => {});
      return t.id;
    }
  }
  const r = await db.insert(chatThreads).values({
    userId: opts.userId ?? null,
    anonId: opts.anonId ?? null,
    title: (opts.firstMessage ?? "").slice(0, 60) || null,
    locale: opts.locale ?? null,
  });
  return Number(r[0].insertId);
}

export async function appendMessage(threadId: number, role: "user" | "assistant", content: string, payload?: unknown) {
  const db = getDb();
  const r = await db.insert(chatMessages).values({ threadId, role, content, payload: payload ?? null });
  await db.update(chatThreads).set({ updatedAt: new Date() }).where(eq(chatThreads.id, threadId)).catch(() => {});
  return Number(r[0].insertId);
}

export async function listThreads(userId: number) {
  const db = getDb();
  const rows = await db.select({
    id: chatThreads.id, title: chatThreads.title, locale: chatThreads.locale, updatedAt: chatThreads.updatedAt,
  }).from(chatThreads).where(eq(chatThreads.userId, userId)).orderBy(desc(chatThreads.updatedAt)).limit(50);
  // 标题兜底：取首条用户消息前 60 字
  const out = [];
  for (const t of rows) {
    let title = t.title;
    if (!title) {
      const [m]: any = await db.execute(sql`SELECT content FROM chat_messages WHERE thread_id=${t.id} AND role='user' ORDER BY id LIMIT 1`);
      title = (m?.[0]?.content ?? "").slice(0, 60) || null;
    }
    out.push({ ...t, title });
  }
  return out;
}

export async function getThreadMessages(threadId: number, userId: number | null, anonId?: string) {
  const db = getDb();
  const rows = await db.select().from(chatThreads).where(eq(chatThreads.id, threadId)).limit(1);
  const t = rows[0];
  if (!t) return null;
  const mine = (userId && t.userId === userId) || (!t.userId && anonId && t.anonId === anonId);
  if (!mine) return null;
  const msgs = await db.select().from(chatMessages).where(eq(chatMessages.threadId, threadId)).orderBy(chatMessages.id).limit(200);
  return { thread: { id: t.id, title: t.title, locale: t.locale }, messages: msgs };
}
