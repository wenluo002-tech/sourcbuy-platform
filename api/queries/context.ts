/**
 * 买侧上下文资产层（2026-11-08 战略解码落地）：
 * 1. logRecommendation —— 推荐证据链落库（每次 AI 推荐留痕：基于什么推了什么）
 * 2. updateBuyerProfile —— 买家画像自动推断（从真实询价消息，绝不让用户填表）
 * 3. getBuyerProfile —— aiSourcing facts 注入用
 * 纪律：全部静默降级（失败只记日志，绝不影响聊天主链路）；画像只从买家自己的消息推断。
 */
import { getDb } from "./connection";
import { sql as dsql } from "drizzle-orm";
import { LEXICON } from "../../contracts/lexicon";
import { DEST_WORDS } from "./aiSourcing";
import { log } from "../lib/logger";

// ---------- 推荐证据链 ----------
export interface RecLogInput {
  userId: number | null;
  threadId: number | null;
  message: string;
  intent?: { product?: string | null; quantity?: number | null } | null;
  destination?: string | null;
  factories?: Array<Record<string, unknown>>;
  productsCount?: number;
  hadLink?: boolean;
  hadImage?: boolean;
  factoryQa?: boolean;
}

export async function logRecommendation(r: RecLogInput): Promise<void> {
  try {
    // 快照只留关键字段（id/分层/评分/证据等级/在售货号），整卡回放靠 chat_messages.payload
    const facs = (r.factories ?? []).slice(0, 6).map((f) => ({
      id: f.id,
      tier: f.tier,
      score: f.score,
      matchBasis: f.matchBasis,
      offerId: (f.linkedOffer as { offerId?: string } | undefined)?.offerId ?? null,
    }));
    const db: any = getDb();
    await db.execute(
      dsql`INSERT INTO recommendation_logs (user_id, thread_id, message, intent_product, intent_quantity, intent_destination, factories, products_count, had_link, had_image, factory_qa)
           VALUES (${r.userId}, ${r.threadId}, ${r.message.slice(0, 500)}, ${r.intent?.product ?? null}, ${r.intent?.quantity ?? null}, ${r.destination ?? null},
                   ${JSON.stringify(facs)}, ${r.productsCount ?? null}, ${r.hadLink ? 1 : 0}, ${r.hadImage ? 1 : 0}, ${r.factoryQa ? 1 : 0})`,
    );
  } catch (e) {
    log.warn("recommendation_logs 落库失败（不影响聊天）", { error: e instanceof Error ? e.message : String(e) });
  }
}

// ---------- 买家画像自动推断 ----------
const PROFILE_WINDOW = 60; // 近 60 条买家消息参与推断
const MIN_SAMPLE = 3; // 少于 3 条消息不出画像（样本不足不猜）

// 产品词 → 类目反查表（模块级构建一次）
const PRODUCT_TO_CAT: Array<[string, string]> = [];
for (const [cat, def] of Object.entries(LEXICON)) {
  for (const p of def.products) if (p.length >= 2) PRODUCT_TO_CAT.push([p, cat]);
}
// 长词优先匹配（"瑜伽裤"先于"裤子"），避免宽泛词吃掉具体词
PRODUCT_TO_CAT.sort((a, b) => b[0].length - a[0].length);

export async function updateBuyerProfile(userId: number): Promise<void> {
  try {
    const db: any = getDb();
    const [rows]: any = await db.execute(
      dsql`SELECT m.content FROM chat_messages m JOIN chat_threads t ON t.id = m.thread_id
           WHERE t.user_id = ${userId} AND m.role = 'user' ORDER BY m.id DESC LIMIT ${PROFILE_WINDOW}`,
    );
    const msgs: string[] = (rows ?? []).map((r: any) => String(r.content ?? ""));
    if (msgs.length < MIN_SAMPLE) return;

    const catN = new Map<string, number>();
    const destN = new Map<string, number>();
    const qtys: number[] = [];
    for (const m of msgs) {
      const hitCat = new Set<string>(); // 单条消息同类目只计一次
      for (const [prod, cat] of PRODUCT_TO_CAT) {
        if (m.includes(prod)) { hitCat.add(cat); }
      }
      for (const c of hitCat) catN.set(c, (catN.get(c) ?? 0) + 1);
      for (const d of DEST_WORDS) {
        if (m.includes(d)) destN.set(d, (destN.get(d) ?? 0) + 1);
      }
      const qm = m.match(/(\d{2,7})\s*(个|件|条|套|双|只|台|pcs?|pieces?|units?)/i);
      if (qm) qtys.unshift(Number(qm[1]));
    }
    const categories = [...catN.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([v, n]) => ({ v, n }));
    const destinations = [...destN.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([v, n]) => ({ v, n }));
    if (!categories.length && !destinations.length) return;

    await db.execute(
      dsql`INSERT INTO buyer_profiles (user_id, categories, destinations, quantities, sample_size, inferred_at, updated_at)
           VALUES (${userId}, ${JSON.stringify(categories)}, ${JSON.stringify(destinations)}, ${JSON.stringify(qtys.slice(0, 10))}, ${msgs.length}, NOW(), NOW())
           ON DUPLICATE KEY UPDATE categories=VALUES(categories), destinations=VALUES(destinations), quantities=VALUES(quantities),
             sample_size=VALUES(sample_size), inferred_at=NOW(), updated_at=NOW()`,
    );
  } catch (e) {
    log.warn("buyer_profiles 推断失败（不影响聊天）", { error: e instanceof Error ? e.message : String(e) });
  }
}

export interface BuyerProfile {
  categories: Array<{ v: string; n: number }>;
  destinations: Array<{ v: string; n: number }>;
  quantities: number[];
  sampleSize: number;
  inferredAt: string;
}

export async function getBuyerProfile(userId: number): Promise<BuyerProfile | null> {
  try {
    const db: any = getDb();
    const [rows]: any = await db.execute(
      dsql`SELECT categories, destinations, quantities, sample_size, inferred_at FROM buyer_profiles WHERE user_id = ${userId} LIMIT 1`,
    );
    const r = rows?.[0];
    if (!r) return null;
    return {
      categories: typeof r.categories === "string" ? JSON.parse(r.categories) : r.categories ?? [],
      destinations: typeof r.destinations === "string" ? JSON.parse(r.destinations) : r.destinations ?? [],
      quantities: typeof r.quantities === "string" ? JSON.parse(r.quantities) : r.quantities ?? [],
      sampleSize: Number(r.sample_size ?? 0),
      inferredAt: String(r.inferred_at ?? ""),
    };
  } catch {
    return null;
  }
}
