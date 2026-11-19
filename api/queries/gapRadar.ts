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
import { createSourcingRequest, transition, failRequest, addCostCredits } from "../lib/sourcingRequest";

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

/** 记录缺口并后台拉候选（P0 2026-11-18 起改写探源主表 sourcing_requests，gap_requests 停写只读）。
 *  返回探源单 id（dedup 复用旧单也返回），供路由层补会话链；null=提不出产品词的原话不落单只留 ops 可见性。
 *  轻量部分（查重+建单）同步执行（本地 SQL，毫秒级），TXGC 拉取仍 fire-and-forget。绝不抛错给调用方。 */
export async function recordGap(keyword: string, locale: string, userId: number | null, opts?: { trustKeyword?: boolean }): Promise<number | null> {
  const db = getDb();
  const raw = keyword.trim().slice(0, 120);
  if (!raw) return null;
  // V104：调用方保证 keyword 是 LLM 意图抽出的产品词（非整句原话）时，LEXICON 提不出词也直接用它——
  // 词库外的品类缺口（马桶这类）不能再 no_keyword 白丢，运营工单要靠它接货。长度闸防整句漏网。
  const kw = extractProductWord(raw) ?? (opts?.trustKeyword && raw.length <= 20 && !/[，。！？!?,.\s]/.test(raw) ? raw : null);
  // 同关键词 DEDUP_HOURS 内已有探源单 → 复用，不重复扣费；上次失败则补跑 enrich
  const [dupRows] = (await db.execute(
    dsql`SELECT id, status FROM sourcing_requests WHERE keyword = ${kw ?? raw} AND created_at >= DATE_SUB(NOW(), INTERVAL ${DEDUP_HOURS} HOUR) ORDER BY id DESC LIMIT 1`,
  )) as unknown as [[{ id: number; status: string }?]];
  const existing = dupRows?.[0];
  if (existing) {
    if (existing.status === "failed") {
      void enrichGap(Number(existing.id), kw ?? raw).catch(() => {});
    }
    return Number(existing.id);
  }
  const sr = await createSourcingRequest({ userId, keyword: kw ?? raw, locale });
  if (!sr) return null;
  if (!kw) {
    // 提不出产品词：建单即失败，买家端亮词条表安抚话术+转人工（死胡同违法）；不花钱拉候选
    await failRequest(sr.id, "no_keyword", `未提取到明确产品词：${raw.slice(0, 60)}`);
    return sr.id;
  }
  void enrichGap(sr.id, kw); // 后台跑，买家答话不等它
  return sr.id;
}

async function enrichGap(srId: number, keyword: string): Promise<void> {
  const db = getDb();
  const t0 = Date.now();
  try {
    const [noRows] = (await db.execute(
      dsql`SELECT request_no FROM sourcing_requests WHERE id = ${srId} LIMIT 1`,
    )) as unknown as [[{ request_no?: string }?]];
    const srNo = String(noRows?.[0]?.request_no ?? "");
    const r = await txgcSearch(keyword, { per_page: 50, srNo });
    if (r.code !== 0 || !r.data) {
      await failRequest(srId, "upstream_error", `code=${r.code} ${r.message}`);
      log.warn("缺口候选拉取失败", { srId, keyword, code: r.code, msg: r.message });
      return;
    }
    await addCostCredits(srId, r.credits_charged ?? 0);
    const items = r.data.items ?? [];
    for (const f of items) {
      // request_id 与 sourcing_request_id 双写同值：request_id 维持 NOT NULL 与 uniq_req_txgc 幂等键不动，
      // 新语义=request 属主 id（探源单=sourcing_requests.id；核查回灌遗留行=0）
      await db.execute(dsql`INSERT INTO gap_candidates
        (request_id, sourcing_request_id, source, txgc_id, name, province, city, establish_date, registered_capital,
         is_foreign_trade, is_specialized, is_high_tech, phones_count, decision_maker_count, main_products, tags)
        VALUES (${srId}, ${srId}, 'txgc', ${f.id}, ${f.name}, ${f.province ?? null}, ${f.city ?? null},
         ${f.establish_date ?? null}, ${f.registered_capital ?? null},
         ${f.is_foreign_trade ? 1 : 0}, ${f.is_specialized ? 1 : 0}, ${f.is_high_tech ? 1 : 0},
         ${f.phones_count ?? 0}, ${f.decision_maker_count ?? 0},
         ${JSON.stringify(f.main_products ?? [])}, ${JSON.stringify(f.tags ?? [])})
        ON DUPLICATE KEY UPDATE name = VALUES(name)`);
    }
    if (items.length === 0) {
      // 上游零命中：安抚话术明示「不代表没有」+ 转人工线下继续找
      await failRequest(srId, "zero_candidates", `${keyword} 上游零命中`);
      return;
    }
    // scanned=扫描完成（count=上游命中总数）；候选入池后再记一条 screened 前的事实事件？不——候选入池属于 scanned 阶段产物，
    // AI 粗筛（P3）未上线前单停在 scanned，步骤条如实显示「候选已入池，粗筛排队中」
    await transition(srId, "scanned", { count: r.data.total, ms: Date.now() - t0 });
    log.info("缺口候选已就位", { srId, keyword, total: r.data.total, pulled: items.length });
  } catch (e) {
    await failRequest(srId, "upstream_error", e instanceof Error ? e.message.slice(0, 250) : String(e)).catch(() => {});
    log.warn("缺口 enrich 异常", { srId, keyword, error: e instanceof Error ? e.message : String(e) });
  }
}

// ─── /ops 工作台接口（opsQuery 白名单闸在路由层）。P0 起读探源主表，gap_requests 停写只读 ───

interface OpsGapRow {
  id: number; request_no: string; keyword: string; locale: string; user_id: number | null;
  status: string; fail_reason: string | null; cost_credits: number | string; created_at: string;
  scanned_at: string | null; candidate_count: number | string;
}

export async function opsListGaps(): Promise<OpsGapRow[]> {
  const db = getDb();
  const [rows] = (await db.execute(
    dsql`SELECT sr.id, sr.request_no, sr.keyword, sr.locale, sr.user_id, sr.status, sr.fail_reason,
                sr.cost_credits, sr.created_at, sr.scanned_at,
                (SELECT COUNT(*) FROM gap_candidates gc WHERE gc.sourcing_request_id = sr.id) AS candidate_count
         FROM sourcing_requests sr ORDER BY sr.id DESC LIMIT 100`,
  )) as unknown as [OpsGapRow[]];
  return rows;
}

interface GapCandidateRow {
  id: number; sourcing_request_id: number; txgc_id: number; name: string;
  province: string | null; city: string | null; establish_date: string | null;
  registered_capital: string | null; is_foreign_trade: number; is_specialized: number;
  is_high_tech: number; phones_count: number; decision_maker_count: number;
  main_products: string | null; tags: string | null; deepdive: string | object | null;
  [k: string]: unknown;
}

export async function opsGapCandidates(sourcingRequestId: number, tradeOnly: boolean) {
  const db = getDb();
  const [rows] = (tradeOnly
    ? await db.execute(dsql`SELECT * FROM gap_candidates WHERE sourcing_request_id = ${sourcingRequestId} AND is_foreign_trade = 1 ORDER BY is_specialized DESC, phones_count DESC, id LIMIT 200`)
    : await db.execute(dsql`SELECT * FROM gap_candidates WHERE sourcing_request_id = ${sourcingRequestId} ORDER BY is_foreign_trade DESC, is_specialized DESC, phones_count DESC, id LIMIT 200`)) as unknown as [GapCandidateRow[]];
  return rows.map((c) => ({
    ...c,
    deepdive_summary: c.deepdive
      ? ((typeof c.deepdive === "string" ? JSON.parse(c.deepdive) : c.deepdive) as { summary?: string })?.summary ?? null
      : null,
    deepdive: undefined, // 列表不带大字段，详情按需取
  }));
}

export async function opsGapDeepdive(candidateId: number) {
  const db = getDb();
  const [ddRows] = (await db.execute(
    dsql`SELECT gc.*, sr.keyword, sr.request_no FROM gap_candidates gc JOIN sourcing_requests sr ON sr.id = gc.sourcing_request_id WHERE gc.id = ${candidateId} LIMIT 1`,
  )) as unknown as [Array<GapCandidateRow & { keyword: string; request_no: string }>];
  const c = ddRows[0];
  if (!c) throw new Error("候选不存在");
  let dd = c.deepdive ? (typeof c.deepdive === "string" ? JSON.parse(c.deepdive) : c.deepdive) : null;
  if (!dd) {
    const resp = await txgcDeepdive(Number(c.txgc_id), c.name, c.keyword);
    if (resp.code !== 0 || !resp.data) throw new Error(`deepdive 失败：code=${resp.code} ${resp.message}`);
    dd = resp.data;
    await db.execute(dsql`UPDATE gap_candidates SET deepdive = ${JSON.stringify(dd)}, deepdived_at = NOW() WHERE id = ${candidateId}`);
    await addCostCredits(Number(c.sourcing_request_id), resp.credits_charged ?? 0);
  }
  return { candidate: { id: c.id, name: c.name, txgc_id: c.txgc_id }, deepdive: dd, cached: !!c.deepdive };
}
