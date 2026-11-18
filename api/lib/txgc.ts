// ═══ 天下工厂开放平台客户端（2026-11-17 接入，罗总提供密钥，应用「工厂雷达」ID 139）═══
// 纪律：密钥只在 .env（TXGC_KEY），绝不入记忆 / 绝不进 git / 绝不进前台浏览器
// 数据定位：上游候选池数据源——进库一律打独立 tag，不直接挂「严选」、不参与 v2 评分；
//           前台永不出现「天下工厂」品牌名（同 1688 隔离铁律）
// 文档：https://www.tianxiagongchang.com/open/llms-full.txt
// 计价：1 credit = 0.0005 元；search 400 / detail 200 / contact 400 / deepdive 500 / agent 200
// 失败不扣费（40000/40100/40201/40300/40400/42900/50000/50400）；search 命中 0 条仍扣 400

import { getDb } from "../queries/connection";
import { sql } from "drizzle-orm";

const BASE = process.env.TXGC_BASE ?? "https://open.tianxiagongchang.com";
const KEY = process.env.TXGC_KEY ?? "";

// 每日成本熔断：默认 20,000 credits ≈ ¥10/日（对标万邦 ¥20/日思路，试点期更紧）
const DAILY_LIMIT = Number(process.env.TXGC_DAILY_CREDIT_LIMIT ?? 20_000);

export const TXGC_PRICE = {
  factory_search: 400,
  factory_detail: 200,
  factory_contact: 400,
  factory_deepdive: 500,
  factory_agent_search: 200,
} as const;
export type TxgcCapability = keyof typeof TXGC_PRICE;

export interface TxgcResp<T = any> {
  code: number;          // 0=成功；成败一律读它，别看 HTTP 状态码
  message: string;
  request_id: string;
  credits_charged: number;
  credits_balance: number;
  data?: T;              // 失败时该键整体缺席，不是 null
}

// 不可重试业务码（重试也不会变，且大多不扣费）
const NO_RETRY = new Set([40000, 40100, 40201, 40300, 40400, 42901]);

async function ensureTable() {
  const db = getDb();
  await db.execute(sql`CREATE TABLE IF NOT EXISTS txgc_calls (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    request_id VARCHAR(64),
    capability VARCHAR(32),
    params JSON,
    code INT,
    credits_charged INT,
    credits_balance INT,
    ms INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_created (created_at)
  )`);
}

async function todaySpent(): Promise<number> {
  const db = getDb();
  // INTERVAL 不吃绑定参数——这里无参数，直接 CURDATE()
  const r: any = await db.execute(
    sql`SELECT COALESCE(SUM(credits_charged),0) s FROM txgc_calls WHERE created_at >= CURDATE()`
  );
  return Number((r[0] as any[])[0]?.s ?? 0);
}

let tableReady = false;

/** 统一调用入口：成本熔断 → 调用 → 对账落库 → 限流退避重试。opts.srNo=探源单号对账（2026-11-18 罗总拍板④） */
export async function txgcCall<T = any>(
  capability: TxgcCapability,
  args: Record<string, unknown>,
  opts: { timeoutMs?: number; srNo?: string } = {},
): Promise<TxgcResp<T>> {
  if (!KEY) throw new Error("TXGC_KEY 未配置");
  if (!tableReady) { await ensureTable(); tableReady = true; }

  const price = TXGC_PRICE[capability];
  const spent = await todaySpent();
  if (spent + price > DAILY_LIMIT) {
    throw new Error(`TXGC 日成本熔断：今日已花 ${spent} credits，本次需 ${price}，上限 ${DAILY_LIMIT}`);
  }

  // deepdive 30~90s 须 120s+；agent 180s+；其余 30s 足够
  const timeoutMs = opts.timeoutMs ?? (capability === "factory_deepdive" ? 150_000
    : capability === "factory_agent_search" ? 200_000 : 30_000);

  let lastErr: any = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const t0 = Date.now();
    let resp: TxgcResp<T> | null = null;
    try {
      const r = await fetch(`${BASE}/open/v1/capabilities/${capability}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
        body: JSON.stringify(args),
        signal: AbortSignal.timeout(timeoutMs),
      });
      resp = (await r.json()) as TxgcResp<T>;
    } catch (e) {
      lastErr = e; // 网络层错误：退避重试（42900/50000/50400 同款节奏 1s/2s/4s）
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    const ms = Date.now() - t0;
    // 对账落库（失败也记，credits_charged=0）
    try {
      const db = getDb();
      await db.execute(sql`INSERT INTO txgc_calls (request_id, capability, params, code, credits_charged, credits_balance, ms, sr_no)
        VALUES (${resp.request_id ?? ""}, ${capability}, ${JSON.stringify(args)}, ${resp.code}, ${resp.credits_charged ?? 0}, ${resp.credits_balance ?? 0}, ${ms}, ${opts.srNo ?? null})`);
    } catch { /* 对账失败不阻断业务 */ }

    if (resp.code === 0) return resp;
    if (NO_RETRY.has(resp.code)) return resp; // 业务终态，交调用方判断
    if (resp.code === 42900 || resp.code === 50000 || resp.code === 50400) {
      if (attempt < 3) { await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt)); continue; }
    }
    return resp; // 未知码不盲目重试
  }
  throw lastErr ?? new Error("TXGC 调用失败（重试耗尽）");
}

// ─── 五个能力的类型化封装 ───

export interface TxgcFactoryBrief {
  id: number; name: string; core_name?: string; uscc?: string;
  province?: string; city?: string; district?: string;
  industries?: string[]; legal_person?: string; registered_capital?: string;
  establish_date?: string; business_status?: string; main_products?: string[];
  address?: string; tags?: string[];
  is_foreign_trade?: boolean; is_specialized?: boolean;
  is_single_champion?: boolean; is_high_tech?: boolean;
  phones_count?: number; decision_maker_count?: number;
}

export async function txgcSearch(keyword: string, opts: {
  intent?: "sales" | "purchase" | "company_query";
  province?: string; city?: string; district?: string; industry?: string;
  page?: number; per_page?: number; srNo?: string;
} = {}) {
  const { srNo, ...args } = opts;
  return txgcCall<{ total: number; page: number; per_page: number; items: TxgcFactoryBrief[] }>(
    "factory_search", { keyword, intent: "purchase", ...args }, { srNo });
}

export async function txgcDetail(company_id: number) {
  return txgcCall<TxgcFactoryBrief & { business_scope?: string; intro?: string }>(
    "factory_detail", { company_id });
}

export async function txgcDeepdive(company_id: number, company_name: string, product?: string) {
  return txgcCall("factory_deepdive",
    product ? { company_id, company_name, product } : { company_id, company_name });
}

export async function txgcContact(company_id: number) {
  return txgcCall<{ company_id: number; phone?: { value: string; position?: string }[]; email?: string[]; website?: string[] }>(
    "factory_contact", { company_id });
}
