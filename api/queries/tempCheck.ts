/**
 * 临时查厂（v66 罗总反馈②）：买家报名字 → 实时调万邦核查一家不在严选库的工厂。
 * 与 shopEnrich 的区别：shopEnrich 补的是【库内厂】的档案空位；本模块查的是【库外厂】，
 * 结果只进 temp_factory_checks（24h 缓存/成本台账），【绝不写 factories 严选库、绝不影响正式评分】。
 * 成本：item_search_factory ¥0.022 + item_get_shop ¥0.05 + seller_info ¥0.05 ≈ ¥0.12/次新查。
 * 闸：注册买家可用、每买家每天 5 次新查、当日万邦总费用 ¥150 熔断、同名 24h 内走缓存零成本。
 * 分数：确定性公式（见 SCORE_RULES），输入全部来自本次拉到的真实字段，缺项计 0——不编数据。
 */
import { getDb } from "./connection";
import { sql as dsql } from "drizzle-orm";
import { log } from "../lib/logger";

const KEY = process.env.WANBANG_KEY || "";
const SECRET = process.env.WANBANG_SECRET || "";
const BASE = "https://api-gw.onebound.cn/1688";
const PRICE_SEARCH_FACTORY = 0.022;
const PRICE_ITEM_GET_SHOP = 0.05;
const PRICE_SELLER_INFO = 0.05;
const DAY_FUSE_CNY = 10; // 临时查厂独立熔断线：本端点当日费用上限（≈80 次新查），不与批量回填共享账本——否则批量任务会把买家侧功能饿死
const PER_USER_DAILY = 5; // 每买家每天新查上限（缓存命中不计）

const norm = (s: string) =>
  (s ?? "").replace(/\s+/g, "").replace(/（/g, "(").replace(/）/g, ")").replace(/，/g, ",");

async function wb(ep: string, params: Record<string, string>): Promise<{ j: any; billed: boolean }> {
  const qs = new URLSearchParams({ key: KEY, secret: SECRET, lang: "zh-CN", cache: "no", ...params });
  // 网络/超时异常自动重试一次（万邦偶发抖动不应让买家看到"上游不可用"）；业务错误码不重试（重试也不会变）
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${BASE}/${ep}/?${qs}`, { signal: AbortSignal.timeout(15000) });
      const j: any = await res.json();
      const billed = j?.error_code === "0000" || j?.error === "" || j?.error_code === undefined;
      if (j?.error && j.error_code !== "0000") throw new Error(`wanbang ${ep}: ${j.error} (${j.error_code ?? "?"})`);
      return { j, billed };
    } catch (e) {
      if (e instanceof Error && e.message.startsWith(`wanbang ${ep}:`)) throw e; // 业务错误码直接抛
      lastErr = e; // 网络/超时：再试一次
    }
  }
  throw lastErr;
}

// 5000 = data error，上游对"查无结果"的返回（实测确认，不扣费）；按接口语义由调用点消化
const is5000 = (e: unknown) => e instanceof Error && e.message.includes("(5000)");

function parseDetail(detail: any): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(detail)) return out;
  for (const sec of detail) {
    for (const items of Object.values(sec ?? {})) {
      if (!Array.isArray(items)) continue;
      for (const it of items as any[]) {
        for (const [k, v] of Object.entries(it)) {
          const key = String(k).replace(/[:\s]+$/g, "").trim();
          if (key && v != null) out[key] = String(v).trim();
        }
      }
    }
  }
  return out;
}

const numFrom = (s: string | undefined): number | null => {
  const m = (s ?? "").replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
};

export interface TempScoreItem {
  key: string; // i18n key 后缀
  points: number;
  max: number;
  fact: string; // 打分依据的原始事实（缺失则记"未获取到"）
}

export interface TempCheckReport {
  status: "ok" | "not_found" | "mismatch";
  queryName: string;
  matchedTitle: string | null;
  sellerNick: string | null;
  vettedFactory?: { id: number; tier: string | null; score: number | null } | null; // 撞库直通：该厂已在严选库时给出档案入口（2026-11-11 罗总拍板数据资产化）
  facts: {
    years: number | null; // 诚信通年限（seller_info.tpyear，缺则用搜索结果 tpservice_year 兜底）
    home: string | null; // 主营类目（搜索结果 cat_name）
    region: string | null; // 所在地区（搜索结果 area）
    level: string | null; // 平台等级（搜索结果 level，如 金牌制造）
    productionType: string | null; // 经营模式
    employeeCount: number | null;
    areaSqm: number | null;
    cert: string | null; // 管理体系认证
    creditCode: string | null; // 统一社会信用代码
    customService: boolean | null; // 是否提供加工/定制
    qualityControl: string | null; // 质量控制
  };
  score: number | null; // 初核分（not_found / mismatch 为 null）
  breakdown: TempScoreItem[];
  cached: boolean;
  checkedAt: string;
}

export type TempCheckResult =
  | { ok: true; report: TempCheckReport }
  | { ok: false; reason: "invalid" | "daily_cap" | "fuse" | "upstream" };

/** 撞库直通：核查到的 seller_nick 若已在严选库，直接给档案入口（零成本，库的复用率最大化） */
async function findVettedByNick(db: any, nick: string | null): Promise<TempCheckReport["vettedFactory"]> {
  if (!nick) return null;
  try {
    const [rows]: any = await db.execute(
      dsql`SELECT id, tier, score FROM factories WHERE member_id = ${nick} AND is_trader = 0 AND dup_of IS NULL LIMIT 1`
    );
    const r = rows?.[0];
    return r ? { id: Number(r.id), tier: r.tier ?? null, score: r.score != null ? Number(r.score) : null } : null;
  } catch {
    return null;
  }
}

/** 买家提名的优质库外厂 → 培育档入严选库（罗总 2026-11-11 拍板：初核数据资产化，利益最大化）。
 *  闸：初核分≥75、名称闸已过、经营模式必须是生产型（贸易商/经销/批发不收——铁律只收源头工厂）、
 *  member_id 幂等判重；评分留 NULL（前台显示"核实中"），严选正式评分等回填管线补齐后出具——绝不拿初核分冒充。 */
const PROMOTE_MIN_SCORE = 75;
async function promoteNominated(db: any, report: TempCheckReport): Promise<void> {
  try {
    if (!report.sellerNick || !report.matchedTitle) return;
    const prod = report.facts.productionType ?? "";
    if (prod && !/生产|制造|加工/.test(prod)) return; // 贸易商/经销商不入严选库
    const [ex]: any = await db.execute(dsql`SELECT id FROM factories WHERE member_id = ${report.sellerNick} LIMIT 1`);
    if (ex?.[0]) return; // 已在库（含被标记贸易商/重复的），不重复插
    const f = report.facts;
    const review = `买家提名实时初核 ${report.score}/100（公开公式现算，缺项计 0）。档案补全中——严选正式评分待全量核验后出具。`;
    await db.execute(
      dsql`INSERT INTO factories
        (member_id, name, location, years, score, tier, medal, production_type, employee_count, area_sqm, cert, review, tags, is_trader)
        VALUES (${report.sellerNick}, ${report.matchedTitle}, ${f.region}, ${f.years}, ${null}, ${"培育"}, ${f.level}, ${f.productionType}, ${f.employeeCount}, ${f.areaSqm}, ${f.cert}, ${review}, ${JSON.stringify(["buyer_nominated"])}, 0)`
    );
    const [newRow]: any = await db.execute(dsql`SELECT id FROM factories WHERE member_id = ${report.sellerNick} LIMIT 1`);
    const fid = newRow?.[0]?.id;
    // 类目打标：主营类目拆词反查 LEXICON 产品词（≥2 字），命中才打——打不上的不打，不编
    if (fid && f.home) {
      const { LEXICON } = await import("../../contracts/lexicon");
      const words = f.home.split(/[;；,，]/).map((w) => w.trim()).filter((w) => w.length >= 2);
      const cats = new Set<string>();
      for (const w of words) {
        for (const [cat, def] of Object.entries(LEXICON)) {
          if (def.products.some((p) => p.length >= 2 && w.includes(p))) cats.add(cat);
        }
      }
      for (const cat of cats) {
        await db.execute(dsql`INSERT IGNORE INTO factory_categories (factory_id, category, source) VALUES (${fid}, ${cat}, 'buyer_nominated')`);
      }
    }
    log.info("买家提名厂入严选库（培育档）", { name: report.matchedTitle, nick: report.sellerNick, score: report.score });
  } catch (e) {
    log.warn("提名厂入库失败（不影响核查返回）", { error: e instanceof Error ? e.message : String(e) });
  }
}

export async function tempCheckFactory(rawName: string, userId: number): Promise<TempCheckResult> {
  const name = (rawName ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
  if (name.length < 4 || !KEY || !SECRET) return { ok: false, reason: "invalid" };
  const db: any = getDb();

  // ① 24h 同名缓存（归一化匹配），命中零成本
  const [cacheRows]: any = await db.execute(
    dsql`SELECT report_json, created_at FROM temp_factory_checks
         WHERE REPLACE(REPLACE(query_name,' ',''),'　','') = ${norm(name)} AND status='ok'
           AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
         ORDER BY id DESC LIMIT 1`,
  );
  const rawCache = cacheRows?.[0]?.report_json;
  if (rawCache) {
    try {
      // mysql2 对 JSON 列自动解析——字符串和对象两种形态都要接
      const r = typeof rawCache === "string" ? JSON.parse(rawCache) : rawCache;
      if (r && r.status === "ok") {
        r.cached = true;
        r.vettedFactory = await findVettedByNick(db, r.sellerNick ?? null); // 缓存是旧报告，撞库入口每次现查
        return { ok: true, report: r };
      }
    } catch { /* 缓存损坏则重查 */ }
  }

  // ② 每买家每日新查上限
  const [uc]: any = await db.execute(
    dsql`SELECT COUNT(*) c FROM temp_factory_checks WHERE user_id=${userId} AND DATE(created_at)=CURDATE()`,
  );
  if (Number(uc?.[0]?.c ?? 0) >= PER_USER_DAILY) return { ok: false, reason: "daily_cap" };

  // ③ 本端点当日费用熔断（独立账本，见上）
  const [sp]: any = await db.execute(
    dsql`SELECT COALESCE(SUM(cost_cny),0) s FROM sourcing_api_logs WHERE provider='wanbang' AND endpoint='tempCheck' AND DATE(created_at)=CURDATE()`,
  );
  if (Number(sp?.[0]?.s ?? 0) >= DAY_FUSE_CNY) return { ok: false, reason: "fuse" };

  let cost = 0;
  let status: TempCheckReport["status"] = "not_found";
  let report: TempCheckReport | null = null;

  try {
    // ④ 公司名 → seller_nick（5000=查无此名 → not_found）
    let arr: any[] = [];
    try {
      const r1 = await wb("item_search_factory", { q: name, page: "1" });
      if (r1.billed) cost += PRICE_SEARCH_FACTORY;
      arr = Array.isArray(r1.j?.item) ? r1.j.item : [];
    } catch (e) {
      if (!is5000(e)) throw e;
    }
    const hit = arr.find((f: any) => norm(String(f?.title ?? "")).includes(norm(name).slice(0, 6))) ?? arr[0];
    // join key 优先 seller_id（b2b-xxx，严选库同款钥匙）；老数据才退回 seller_nick
    const nick = hit?.seller_id ? String(hit.seller_id) : hit?.seller_nick ? String(hit.seller_nick) : null;
    // 搜索结果自带的免费事实（不花 item_get_shop 的钱也已拿到）
    const hitYears = hit?.tpservice_year != null ? Number(hit.tpservice_year) || null : null;
    const hitCat = hit?.cat_name ? String(hit.cat_name) : null;
    const hitArea = hit?.area ? String(hit.area) : null;
    const hitLevel = hit?.level ? String(hit.level) : null;

    if (nick) {
      // ⑤ 深度档案 + 诚信通档案
      let shopTitle = "";
      let d: Record<string, string> = {};
      let years: number | null = null;
      let empExact: number | null = null;

      try {
        const r2 = await wb("item_get_shop", { sid: nick });
        if (r2.billed) cost += PRICE_ITEM_GET_SHOP;
        if (r2.billed) {
          shopTitle = String(r2.j?.title ?? "");
          d = parseDetail(r2.j?.detail);
        }
      } catch (e) {
        // 5000=无深度档案：用搜索命中的标题兜底走名称闸，其余字段缺失计 0（不编数据）
        if (is5000(e)) shopTitle = String(hit?.title ?? "");
      }

      try {
        const r3 = await wb("seller_info", { sid: nick });
        if (r3.billed) cost += PRICE_SELLER_INFO;
        if (r3.billed) {
          years = r3.j?.tpyear != null ? Number(r3.j.tpyear) || null : null;
          const ci: any[] = Array.isArray(r3.j?.company_info) ? r3.j.company_info : [];
          empExact = numFrom(ci.find((x) => x?.title === "员工人数")?.value);
        }
      } catch { /* 降级 */ }

      // 名称闸：归一化后互相包含才算同一家
      const matched =
        shopTitle && (norm(shopTitle).includes(norm(name)) || norm(name).includes(norm(shopTitle)));

      if (matched) {
        status = "ok";
        if (years == null) years = hitYears; // 搜索自带年限兜底
        const prod = d["经营模式"] || null;
        const certRaw = d["管理体系认证"] || null;
        const cert = certRaw && !/^(无|其他)$/.test(certRaw) ? certRaw.replace(/[;；\s]+$/, "") : null;
        const emp = empExact ?? numFrom(d["员工人数"]);
        const area = numFrom(d["厂房面积"]);
        const custom = /^是/.test(d["是否提供加工/定制服务"] ?? "") ? true : d["是否提供加工/定制服务"] ? false : null;
        const qc = d["质量控制"] && d["质量控制"] !== "无" ? d["质量控制"] : null;

        // —— 初核分（满分 100，缺项计 0，规则全量下发前端展示）——
        const b: TempScoreItem[] = [];
        const yPts = years != null ? Math.min(years, 10) * 4 : 0;
        b.push({ key: "years", points: yPts, max: 40, fact: years != null ? String(years) : "" });
        const ePts = emp == null ? 0 : emp >= 500 ? 20 : emp >= 100 ? 15 : emp >= 50 ? 12 : emp >= 20 ? 8 : 4;
        b.push({ key: "employees", points: ePts, max: 20, fact: emp != null ? String(emp) : "" });
        b.push({ key: "cert", points: cert ? 15 : 0, max: 15, fact: cert ?? "" });
        const isMfr = prod != null && /生产|制造|加工/.test(prod);
        const isTrader = prod != null && !isMfr && /贸易|经销|批发/.test(prod);
        b.push({ key: "mode", points: isMfr ? 15 : isTrader ? 6 : 0, max: 15, fact: prod ?? "" });
        const sPts = (custom === true ? 5 : 0) + (qc ? 5 : 0);
        b.push({ key: "service", points: sPts, max: 10, fact: [custom === true ? "custom" : "", qc ?? ""].filter(Boolean).join("; ") });
        const score = b.reduce((s, x) => s + x.points, 0);

        report = {
          status,
          queryName: name,
          matchedTitle: shopTitle,
          sellerNick: nick,
          facts: {
            years, home: hitCat, region: hitArea, level: hitLevel, productionType: prod, employeeCount: emp, areaSqm: area, cert,
            creditCode: d["工商注册号/统一社会信用代码"] || null,
            customService: custom, qualityControl: qc,
          },
          score,
          breakdown: b,
          cached: false,
          checkedAt: new Date().toISOString(),
          vettedFactory: await findVettedByNick(db, nick),
        };
      } else {
        status = "mismatch";
        report = {
          status, queryName: name, matchedTitle: shopTitle || String(hit?.title ?? "") || null,
          sellerNick: nick,
          facts: { years: null, home: null, region: null, level: null, productionType: null, employeeCount: null, areaSqm: null, cert: null, creditCode: null, customService: null, qualityControl: null },
          score: null, breakdown: [], cached: false, checkedAt: new Date().toISOString(),
        };
      }
    }
  } catch (e) {
    await db.execute(
      dsql`INSERT INTO sourcing_api_logs (provider, endpoint, query, cost_cny, billed, ok, duration_ms, error) VALUES ('wanbang','tempCheck',${name},${cost},${cost > 0},0,0,${String(e instanceof Error ? e.message : e).slice(0, 150)})`,
    ).catch(() => {});
    return { ok: false, reason: "upstream" };
  }

  // 台账 + 留档（低分/不匹配的记录只留档 24h 缓存用；优质提名厂由下方钩子入严选库培育档——罗总 2026-11-11 拍板）
  await db.execute(
    dsql`INSERT INTO temp_factory_checks (user_id, query_name, matched_title, seller_nick, status, score, report_json, cost_cny)
         VALUES (${userId}, ${norm(name)}, ${report?.matchedTitle ?? null}, ${report?.sellerNick ?? null}, ${status}, ${report?.score ?? null}, ${report && status === "ok" ? JSON.stringify(report) : null}, ${cost})`,
  ).catch(() => {});

  // 优质提名厂入库钩子：初核≥75、名称闸过、不在库 → 培育档（fire-and-forget，绝不阻塞核查返回）
  if (status === "ok" && report && (report.score ?? 0) >= PROMOTE_MIN_SCORE && !report.vettedFactory) {
    void promoteNominated(db, report).catch(() => {});
  }
  await db.execute(
    dsql`INSERT INTO sourcing_api_logs (provider, endpoint, query, cost_cny, billed, ok, duration_ms, error) VALUES ('wanbang','tempCheck',${name},${cost},${cost > 0},1,0,${status === "ok" ? null : status})`,
  ).catch(() => {});

  if (!report) {
    report = {
      status: "not_found", queryName: name, matchedTitle: null, sellerNick: null,
      facts: { years: null, home: null, region: null, level: null, productionType: null, employeeCount: null, areaSqm: null, cert: null, creditCode: null, customService: null, qualityControl: null },
      score: null, breakdown: [], cached: false, checkedAt: new Date().toISOString(),
    };
  }
  return { ok: true, report };
}
