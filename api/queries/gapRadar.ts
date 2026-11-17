/**
 * 品类缺口候选池（P2，2026-11-17 罗总拍板）：买家问了我方库内零覆盖的品类（无厂无货）
 * → 后台自动调天下工厂 factory_search 拉 50 家候选，沉淀 gap_requests/gap_candidates，
 * /ops 工作台「品类缺口」页给 48h 人工定向寻源配弹药；运营可对单家跑 deepdive（¥0.25）。
 *
 * 纪律：
 * - 候选只进本模块两张表，绝不写 factories 严选库、绝不参与 v2 评分、前台永不出现来源品牌名
 * - fire-and-forget：绝不阻塞买家答话；同关键词 24h 去重（复用缺口单，不重复扣费）
 * - 费用：每次缺口 1×factory_search=400 credits≈¥0.2；日熔断在 api/lib/txgc.ts（默认 ¥10/日）
 * - 已知噪声：关键词搜会混入配套厂——候选池定位是"人工寻源初筛弹药"，deepdive 二道过滤由运营在 /ops 触发
 */
import { getDb } from "./connection";
import { sql as dsql } from "drizzle-orm";
import { txgcSearch, txgcDeepdive } from "../lib/txgc";
import { LEXICON } from "../../contracts/lexicon";
import { log } from "../lib/logger";

const DEDUP_HOURS = 24;

/** 从买家原话里提取词库产品词（最长命中优先）。意图抽取偶尔会把整句传进来，直接拿去搜上游必空还白扣 ¥0.2。 */
export function extractProductWord(text: string): string | null {
  let best: string | null = null;
  for (const def of Object.values(LEXICON)) {
    for (const p of def.products) {
      if (p.length >= 2 && text.includes(p) && (!best || p.length > best.length)) best = p;
    }
  }
  return best;
}

/** 记录缺口并后台拉候选。返回是否新触发（重复缺口复用旧单）。绝不抛错给调用方。 */
export async function recordGap(keyword: string, locale: string, userId: number | null): Promise<void> {
  const db = getDb();
  const raw = keyword.trim().slice(0, 120);
  if (!raw) return;
  // 清洗：只认词库产品词；提不出产品词的原话照记（ops 看得见买家问过什么）但不花钱拉候选
  const kw = extractProductWord(raw);
  if (!kw) {
    await db.execute(dsql`INSERT INTO gap_requests (keyword, locale, user_id, status, error) VALUES (${raw}, ${locale}, ${userId}, 'no_keyword', '未提取到明确产品词，未拉取候选')`);
    return;
  }
  // 同关键词 DEDUP_HOURS 内已有缺口单 → 复用，不重复扣费
  const dup: any = await db.execute(
    dsql`SELECT id, status FROM gap_requests WHERE keyword = ${kw} AND created_at >= DATE_SUB(NOW(), INTERVAL ${DEDUP_HOURS} HOUR) ORDER BY id DESC LIMIT 1`,
  );
  const existing = (dup[0] as any[])[0];
  if (existing) {
    // 上次 enrich 失败则补跑一次（幂等：候选表有 uniq_req_txgc）
    if (existing.status === "error") void enrichGap(Number(existing.id), kw);
    return;
  }
  const ins: any = await db.execute(
    dsql`INSERT INTO gap_requests (keyword, locale, user_id) VALUES (${kw}, ${locale}, ${userId})`,
  );
  const requestId = Number(ins[0]?.insertId);
  if (!requestId) return;
  log.info("品类缺口记录", { requestId, keyword: kw, locale });
  void enrichGap(requestId, kw); // 后台跑，买家答话不等它
}

async function enrichGap(requestId: number, keyword: string): Promise<void> {
  const db = getDb();
  try {
    const r = await txgcSearch(keyword, { per_page: 50 });
    if (r.code !== 0 || !r.data) {
      await db.execute(dsql`UPDATE gap_requests SET status = 'error', error = ${`code=${r.code} ${r.message}`} WHERE id = ${requestId}`);
      log.warn("缺口候选拉取失败", { requestId, keyword, code: r.code, msg: r.message });
      return;
    }
    const items = r.data.items ?? [];
    for (const f of items) {
      await db.execute(dsql`INSERT INTO gap_candidates
        (request_id, txgc_id, name, province, city, establish_date, registered_capital,
         is_foreign_trade, is_specialized, is_high_tech, phones_count, decision_maker_count, main_products, tags)
        VALUES (${requestId}, ${f.id}, ${f.name}, ${f.province ?? null}, ${f.city ?? null},
         ${f.establish_date ?? null}, ${f.registered_capital ?? null},
         ${f.is_foreign_trade ? 1 : 0}, ${f.is_specialized ? 1 : 0}, ${f.is_high_tech ? 1 : 0},
         ${f.phones_count ?? 0}, ${f.decision_maker_count ?? 0},
         ${JSON.stringify(f.main_products ?? [])}, ${JSON.stringify(f.tags ?? [])})
        ON DUPLICATE KEY UPDATE name = VALUES(name)`);
    }
    await db.execute(
      dsql`UPDATE gap_requests SET status = 'enriched', txgc_total = ${r.data.total}, candidate_count = ${items.length}, enriched_at = NOW() WHERE id = ${requestId}`,
    );
    log.info("缺口候选已就位", { requestId, keyword, total: r.data.total, pulled: items.length });
  } catch (e) {
    await db.execute(
      dsql`UPDATE gap_requests SET status = 'error', error = ${e instanceof Error ? e.message.slice(0, 250) : String(e)} WHERE id = ${requestId}`,
    ).catch(() => {});
    log.warn("缺口 enrich 异常", { requestId, keyword, error: e instanceof Error ? e.message : String(e) });
  }
}

// ─── /ops 工作台接口（opsQuery 白名单闸在路由层）───

export async function opsListGaps() {
  const db = getDb();
  const r: any = await db.execute(
    dsql`SELECT id, keyword, locale, user_id, status, txgc_total, candidate_count, error, created_at, enriched_at
         FROM gap_requests ORDER BY id DESC LIMIT 100`,
  );
  return r[0] as any[];
}

export async function opsGapCandidates(requestId: number, tradeOnly: boolean) {
  const db = getDb();
  const r: any = tradeOnly
    ? await db.execute(dsql`SELECT * FROM gap_candidates WHERE request_id = ${requestId} AND is_foreign_trade = 1 ORDER BY is_specialized DESC, phones_count DESC, id LIMIT 200`)
    : await db.execute(dsql`SELECT * FROM gap_candidates WHERE request_id = ${requestId} ORDER BY is_foreign_trade DESC, is_specialized DESC, phones_count DESC, id LIMIT 200`);
  return (r[0] as any[]).map((c) => ({
    ...c,
    deepdive_summary: c.deepdive ? (typeof c.deepdive === "string" ? JSON.parse(c.deepdive) : c.deepdive)?.summary ?? null : null,
    deepdive: undefined, // 列表不带大字段，详情按需取
  }));
}

export async function opsGapDeepdive(candidateId: number) {
  const db = getDb();
  const r: any = await db.execute(dsql`SELECT gc.*, gr.keyword FROM gap_candidates gc JOIN gap_requests gr ON gr.id = gc.request_id WHERE gc.id = ${candidateId} LIMIT 1`);
  const c = (r[0] as any[])[0];
  if (!c) throw new Error("候选不存在");
  let dd = c.deepdive ? (typeof c.deepdive === "string" ? JSON.parse(c.deepdive) : c.deepdive) : null;
  if (!dd) {
    const resp = await txgcDeepdive(Number(c.txgc_id), c.name, c.keyword);
    if (resp.code !== 0 || !resp.data) throw new Error(`deepdive 失败：code=${resp.code} ${resp.message}`);
    dd = resp.data;
    await db.execute(dsql`UPDATE gap_candidates SET deepdive = ${JSON.stringify(dd)}, deepdived_at = NOW() WHERE id = ${candidateId}`);
  }
  return { candidate: { id: c.id, name: c.name, txgc_id: c.txgc_id }, deepdive: dd, cached: !!c.deepdive };
}
