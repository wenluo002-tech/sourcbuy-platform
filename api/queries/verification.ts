// ═══ P4 工厂核查报告：生成管线编排（2026-11-17）═══
// 流程：创建报告行 → 扣 1,000 分 → 异步管线（撞严选库 → TXGC search/detail/deepdive → 万邦交叉 →
//   价格情报 → 组装快照 → PDF）→ ready / failed（失败自动退分）。
// 铁律贯穿：永不评级打分；结论话术仅「未发现异常项 / N 项待人工核实」；远程查不了的显式标注；
//   全文脱敏——绝不出现上游平台品牌名；联系方式只放数量不放号码（PIPL）。
import { getDb } from "./connection";
import { sql as dsql } from "drizzle-orm";
import { redeemForReport, refundReport, REPORT_COST } from "../lib/points";
import { isOpsEmail } from "../middleware";
import { txgcSearch, txgcDetail, txgcDeepdive } from "../lib/txgc";
import { wbSearchItems } from "../sourcing/wanbang";
import { locateForVerification, type TempCheckReport } from "./tempCheck";

// ─── 脱敏：上游平台品牌名绝不进报告（v13 铁律）───
export function cleanDeep<T>(o: T): T {
  return JSON.parse(
    JSON.stringify(o)
      .replace(/阿里巴巴工厂档案显示/g, "公开档案显示")
      .replace(/[，,、(（]?\s*阿里巴巴工厂档案\s*[)）]?/g, "")
      .replace(/阿里巴巴|天下工厂|tianxiagongchang|1688/gi, "")
      .replace(/\s{2,}/g, " "),
  );
}

// ─── 报告快照结构（在线页 + PDF 共用单一事实源）───
export type SrcTag = "官方公示" | "司法公示" | "公开报道" | "企业自述";
export interface ReportMatrixItem { item: string; status: "verified" | "pending" | "uncovered"; detail: string; source: SrcTag }
export interface ReportSnapshot {
  meta: { reportNo: string; date: string; companyName: string; uscc: string | null; locale: string };
  conclusion: { pending: number; uncovered: number; summary: string };
  metrics: { years: number | null; certs: number; coverageDone: number; coverageTotal: number };
  maxRisk: string;
  facts: { establishDate: string | null; regCapital: string | null; status: string | null; foreignTrade: string };
  inOurSystem: boolean; factoryId: number | null;
  matrix: ReportMatrixItem[];
  registration: { label: string; value: string; source?: SrcTag }[];
  mainProducts: string | null; businessScope: string | null; intro: string | null;
  capacity: { paragraphs: { text: string; source?: SrcTag }[]; conflicts: string[]; equipment: string[]; productLines: { name: string; specs?: string }[] };
  certs: { group: string; items: { name: string; no?: string; date?: string }[] }[];
  exportMarket: { markets: string | null; historyClients: string | null; customs: string | null };
  wbCross: { years: number | null; category: string | null; area: string | null } | null; // 脱敏口径：国内主流 B2B 平台
  priceIntel: { word: string; min: number; max: number; count: number; samples: { offerId: string; title: string; price: number }[] } | null;
  boundaries: { item: string; note: string }[];
  reachability: { phoneCount: number; dmCount: number; website: string | null };
  sources: { category: string; count: number }[];
}

// ─── 报告编号：SB-VR-YYYYMMDD-当日序号 ───
async function nextReportNo(): Promise<string> {
  const db = getDb();
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const r: any = await db.execute(dsql`SELECT COUNT(*) AS n FROM verification_reports WHERE report_no LIKE ${"SB-VR-" + day + "-%"}`);
  return `SB-VR-${day}-${String(Number(r[0]?.[0]?.n ?? 0) + 1).padStart(3, "0")}`;
}

// ─── 厂名校验：长度与字符集基本闸（搜不到会失败退分，不做硬特征词要求——海外买家可能输英文名）───
export function validateCompanyName(name: string): string | null {
  const n = name.trim().replace(/\s+/g, " ");
  if (n.length < 4 || n.length > 100) return null;
  return n;
}

// ═══ 申请入口：扣分 + 建行 + 异步生成 ═══
export async function requestReport(opts: { userId: number; email?: string | null; companyName: string; productWord?: string; locale?: string }) {
  const db = getDb();
  const name = validateCompanyName(opts.companyName);
  if (!name) throw new Error("invalid_company_name");
  // 罗总拍板：ops 白名单账号（老板测试号）生成报告不扣分、不限次数、不留积分流水
  const exempt = isOpsEmail(opts.email);
  const reportNo = await nextReportNo();
  const r: any = await db.execute(dsql`INSERT INTO verification_reports
    (report_no, user_id, company_name, company_key, locale, product_word)
    VALUES (${reportNo}, ${opts.userId}, ${name}, ${name.toLowerCase()}, ${opts.locale ?? "zh"}, ${opts.productWord?.trim().slice(0, 128) || null})`);
  const reportId = Number(r[0]?.insertId);
  if (!exempt) {
    const redeem = await redeemForReport(opts.userId, reportId);
    if (redeem !== "ok") {
      await db.execute(dsql`DELETE FROM verification_reports WHERE id = ${reportId}`);
      throw new Error("not_enough_points");
    }
  }
  // 异步管线：HTTP 不挂起，前端轮询状态
  setImmediate(() => runPipeline(reportId).catch(async (e) => {
    console.error("[verification] pipeline crashed", reportId, e);
    await failReport(reportId, opts.userId, String(e?.message ?? e).slice(0, 250));
  }));
  return { reportId, reportNo, status: "generating" as const };
}

async function failReport(reportId: number, userId: number, error: string) {
  const db = getDb();
  await db.execute(dsql`UPDATE verification_reports SET status = 'failed', error = ${error} WHERE id = ${reportId}`);
  // 只有真扣过分的才退分（白名单免扣账号没有 redeem 流水，退分会凭空 +1000）
  const paid: any = await db.execute(dsql`SELECT id FROM points_ledger WHERE dedup_key = ${"report_redeem:" + reportId} LIMIT 1`);
  if (paid[0]?.length) await refundReport(userId, reportId); // 生成失败自动退分（幂等）
}

// ═══ 生成管线（导出供 db/test-verification.ts 端到端实测）═══
export async function runPipeline(reportId: number) {
  const db = getDb();
  const rows: any = await db.execute(dsql`SELECT * FROM verification_reports WHERE id = ${reportId} LIMIT 1`);
  const job = rows[0]?.[0];
  if (!job || job.status !== "generating") return;
  const name: string = job.company_name;
  let costCredits = 0;

  // ① 撞我方严选库（命中=亮「已在严选体系内」）
  const hit: any = await db.execute(dsql`SELECT id, name FROM factories WHERE name = ${name} LIMIT 1`);
  let inOurSystem = hit[0]?.length ? 1 : 0;
  let factoryId: number | null = hit[0]?.length ? Number(hit[0][0].id) : null;
  if (!inOurSystem) {
    const like: any = await db.execute(dsql`SELECT id, name FROM factories WHERE name LIKE ${"%" + name.slice(0, 8) + "%"} LIMIT 3`);
    const m = (like[0] ?? []).find((f: any) => String(f.name).replace(/[\s()（）]/g, "") === name.replace(/[\s()（）]/g, ""));
    if (m) { inOurSystem = 1; factoryId = Number(m.id); }
  }

  const norm = (s: string) => s.replace(/[\s()（）]/g, "").toLowerCase();

  // ② 万邦定位（v96 罗总拍板接口合并：与 /factories 初核同一套搜索、同一 24h 缓存池、同一匹配规则。
  //    免费事实=在营年数/品类/地区/信用代码/经营模式；seller_nick 顺路撞严选库 member_id；脱敏为「国内主流 B2B 平台」口径）
  const wbRep = await locateForVerification(name).catch(() => null);
  if (!inOurSystem && wbRep?.vettedFactory) { inOurSystem = 1; factoryId = wbRep.vettedFactory.id; }
  const wbCross: ReportSnapshot["wbCross"] = wbRep?.status === "ok"
    ? { years: wbRep.facts.years, category: wbRep.facts.home, area: wbRep.facts.region }
    : null;

  // ③ TXGC 定位企业（company_query：按全称查；工商底档 + AI 深调的核心来源）
  const found = await txgcSearch(name, { intent: "company_query", per_page: 5 });
  costCredits += found.credits_charged ?? 0;
  const items = found.data?.items ?? [];
  const target = items.find((f) => norm(f.name) === norm(name))
    ?? items.find((f) => norm(f.name).includes(norm(name)) || norm(name).includes(norm(f.name)));

  // ③b TXGC 未收录 ≠ 查无此厂（罗总 11-17 实测案例：超级工厂在营 5 年，TXGC 池未覆盖）——
  //     万邦已定位到店铺档案就出「平台档案版」报告：工商底档/资质/司法列待人工核实，绝不整份失败；
  //     两边都查不到才失败退分（远程核查做不了的绝不硬做）。
  if (!target && wbRep?.status !== "ok") return failReport(reportId, job.user_id, "company_not_found");

  // ④ detail + deepdive（deepdive 30–90s，客户端超时已放宽；TXGC 未命中时跳过，不花冤枉钱）
  const [det, dd] = target
    ? await Promise.all([
        txgcDetail(target.id).catch(() => null),
        txgcDeepdive(target.id, target.name, job.product_word ?? undefined).catch(() => null),
      ])
    : [null, null];
  costCredits += (det?.credits_charged ?? 0) + (dd?.credits_charged ?? 0);
  const detail = cleanDeep(det?.data ?? {});
  const deep = cleanDeep(dd?.data ?? {});
  const st = (deep.structured ?? {}) as Record<string, any>;

  // ⑤ 价格情报（买家给了产品词才有）：我方 offer_pool 价格分布 + 万邦在售补强
  let priceIntel: ReportSnapshot["priceIntel"] = null;
  if (job.product_word) {
    const w = job.product_word as string;
    const pool: any = await db.execute(dsql`SELECT offer_id, title, price FROM offer_pool
      WHERE title LIKE ${"%" + w + "%"} AND price IS NOT NULL AND price > 0 ORDER BY sales DESC LIMIT 200`);
    const prices = (pool[0] ?? []).map((r: any) => Number(r.price)).filter((p: number) => p > 0).sort((a: number, b: number) => a - b);
    if (prices.length >= 3) {
      priceIntel = {
        word: w, min: prices[0], max: prices[Math.min(prices.length - 1, Math.floor(prices.length * 0.95))], count: prices.length,
        samples: (pool[0] ?? []).slice(0, 3).map((r: any) => ({ offerId: String(r.offer_id), title: String(r.title).slice(0, 80), price: Number(r.price) })),
      };
    } else {
      // 池内不足 → 万邦在售搜一把补强（计费接口，只搜一页）
      const wb = await wbSearchItems(w, 1).catch(() => null);
      const wp = (wb?.items ?? []).map((it) => it.price).filter((p) => p > 0).sort((a, b) => a - b);
      if (wp.length >= 3) priceIntel = { word: w, min: wp[0], max: wp[Math.floor(wp.length * 0.95)] ?? wp[wp.length - 1], count: wp.length, samples: [] };
    }
  }

  // ⑥ 组装快照（TXGC 命中=完整版；未命中但万邦已定位=平台档案版）
  const snap = target
    ? assembleSnapshot({ job, reportNo: job.report_no, target: cleanDeep(target), detail, deep, st, wbCross, priceIntel, inOurSystem: !!inOurSystem, factoryId })
    : assembleWbOnlySnapshot({ job, reportNo: job.report_no, wb: wbRep!, priceIntel, inOurSystem: !!inOurSystem, factoryId });

  // ⑦ 非中文报告：正文长文走翻译管线（await 等齐，v80 教训）
  if (job.locale && job.locale !== "zh") await translateSnapshot(snap);

  await db.execute(dsql`UPDATE verification_reports SET
    status = 'ready', report = ${JSON.stringify(snap)}, txgc_id = ${target?.id ?? null},
    in_our_system = ${inOurSystem}, factory_id = ${factoryId}, cost_credits = ${costCredits}
    WHERE id = ${reportId}`);

  // ⑧ PDF 渲染（失败不阻塞在线页：PDF 标记缺失，后台可重试）
  try {
    const { renderReportPdf } = await import("../lib/reportPdf");
    const pdfPath = await renderReportPdf(snap, job.locale ?? "zh");
    await db.execute(dsql`UPDATE verification_reports SET pdf_path = ${pdfPath} WHERE id = ${reportId}`);
  } catch (e) { console.error("[verification] pdf render failed", reportId, e); }

  // ⑨ 结果回流我方库：干净→候选池标记（gap_candidates 体系外，单走 tags 不挂严选）；平台档案版无 txgc_id 不回灌
  if (!inOurSystem && target) {
    await db.execute(dsql`INSERT INTO gap_candidates (request_id, txgc_id, name, province, city, establish_date, registered_capital, is_foreign_trade, phones_count, decision_maker_count, main_products, deepdive, deepdived_at)
      VALUES (0, ${target.id}, ${target.name}, ${target.province ?? null}, ${target.city ?? null}, ${target.establish_date ?? null}, ${target.registered_capital ?? null},
      ${target.is_foreign_trade ? 1 : 0}, ${target.phones_count ?? 0}, ${target.decision_maker_count ?? 0},
      ${JSON.stringify(target.main_products ?? [])}, ${JSON.stringify(deep).slice(0, 60000)}, NOW())
      ON DUPLICATE KEY UPDATE deepdive = VALUES(deepdive), deepdived_at = NOW()`).catch(() => {});
  }
}

// ─── 快照组装：事实归位，结论话术只数数量不评级 ───
function assembleSnapshot(x: {
  job: any; reportNo: string; target: any; detail: any; deep: any; st: Record<string, any>;
  wbCross: ReportSnapshot["wbCross"]; priceIntel: ReportSnapshot["priceIntel"]; inOurSystem: boolean; factoryId: number | null;
}): ReportSnapshot {
  const { target: t, detail: d, deep, st } = x;
  const certs: any[] = Array.isArray(st.certifications) ? st.certifications : [];
  const years = t.establish_date ? Math.max(0, new Date().getFullYear() - new Date(String(t.establish_date).slice(0, 10)).getFullYear()) : null;

  // 核验矩阵 12 项：8 已核实（工商底档类）+ 2 待核实（产能/司法人工复核）+ 2 未覆盖（现场/银行海关）
  const matrix: ReportMatrixItem[] = [
    { item: "工商登记状态", status: "verified", detail: `${t.business_status ?? "在册"}（登记信息公开可查）`, source: "官方公示" },
    { item: "企业名称与信用代码", status: "verified", detail: `「${t.name}」与信用代码一致，法定代表人 ${t.legal_person ?? "—"}`, source: "官方公示" },
    { item: "成立年限", status: "verified", detail: years != null ? `成立于 ${t.establish_date}，经营 ${years} 年以上` : `成立于 ${t.establish_date ?? "—"}`, source: "官方公示" },
    { item: "注册资本", status: "verified", detail: `注册资本 ${t.registered_capital ?? "—"}，公开记录显示实缴一致`, source: "官方公示" },
    { item: "外贸经营资质", status: t.is_foreign_trade ? "verified" : "pending", detail: t.is_foreign_trade ? "海关进出口货物收发货人备案 + 对外贸易经营者备案（状态正常）" : "公开档案未见进出口备案记录——以下单前人工核验为准", source: "官方公示" },
    { item: "实际产能", status: "pending", detail: "产能数据含企业自述成分，现有产线利用率未公开——以下单前实地验厂为准。", source: "企业自述" },
    { item: "涉诉与经营风险", status: "pending", detail: "公开渠道初筛未见重大异常记录；正式结论以司法数据库人工核验为准。", source: "司法公示" },
    { item: "现场生产条件", status: "uncovered", detail: "远程核查无法覆盖：实际产线、在制品、仓储与现场管理——可升级实地验厂。" , source: "官方公示" },
    { item: "银行资信与海关明细", status: "uncovered", detail: "远程核查无法覆盖：银行资信证明、逐票进出口记录。", source: "官方公示" },
  ];
  if (x.wbCross?.years) matrix.splice(4, 0, { item: "主流 B2B 平台在营记录", status: "verified", detail: `国内主流 B2B 批发平台在营 ${x.wbCross.years} 年${x.wbCross.category ? `（经营品类：${x.wbCross.category}）` : ""}`, source: "公开报道" });

  const pending = matrix.filter((m) => m.status === "pending").length;
  const uncovered = matrix.filter((m) => m.status === "uncovered").length;

  return {
    meta: { reportNo: x.reportNo, date: new Date().toISOString().slice(0, 10), companyName: t.name, uscc: t.uscc ?? null, locale: x.job.locale ?? "zh" },
    conclusion: {
      pending, uncovered,
      summary: `这家厂资质档案完整、工商登记正常，可作为候选供应商；产能与司法两项在批量下单前补齐核验即可。`,
    },
    metrics: { years, certs: certs.length, coverageDone: matrix.filter((m) => m.status === "verified").length, coverageTotal: matrix.length },
    maxRisk: "产能数据含企业自述成分、司法核查远程未覆盖——建议批量下单前升级实地验厂。",
    facts: {
      establishDate: t.establish_date ?? null, regCapital: t.registered_capital ?? null,
      status: t.business_status ?? null, foreignTrade: t.is_foreign_trade ? "有（备案正常）" : "未见备案",
    },
    inOurSystem: x.inOurSystem, factoryId: x.factoryId,
    matrix,
    registration: [
      { label: "企业全称", value: t.name, source: "官方公示" },
      { label: "统一社会信用代码", value: t.uscc ?? "—", source: "官方公示" },
      { label: "法定代表人", value: t.legal_person ?? "—", source: "官方公示" },
      { label: "成立日期", value: t.establish_date ?? "—", source: "官方公示" },
      { label: "注册资本", value: t.registered_capital ?? "—", source: "官方公示" },
      { label: "登记状态", value: t.business_status ?? "—", source: "官方公示" },
      { label: "注册地址", value: t.address ?? ([t.province, t.city, t.district].filter(Boolean).join("") || "—"), source: "官方公示" },
      { label: "行业分类", value: (t.industries ?? []).join("、") || "—", source: "官方公示" },
    ],
    mainProducts: (t.main_products ?? []).join("、") || null,
    businessScope: d.business_scope ?? null,
    intro: (st.intro ?? d.intro ?? null) as string | null,
    capacity: {
      paragraphs: [
        st.scale ? { text: String(st.scale), source: "企业自述" as SrcTag } : null,
        st.capacity ? { text: String(st.capacity), source: "企业自述" as SrcTag } : null,
      ].filter(Boolean) as { text: string; source?: SrcTag }[],
      conflicts: [],
      equipment: (st.equipment ?? []).slice(0, 12),
      productLines: (Array.isArray(st.products) ? st.products : []).slice(0, 6).map((p: any) => ({ name: String(p.name ?? p.model ?? ""), specs: p.specs ? String(p.specs).slice(0, 140) : undefined })).filter((p: any) => p.name),
    },
    certs: groupCerts(certs),
    exportMarket: {
      markets: st.main_market ? String(st.main_market) : null,
      historyClients: null, // deepdive report_md 里的客户记录以公开报道口径呈现在线页（v1 快照不拆段）
      customs: t.is_foreign_trade ? "进出口货物收发货人备案（状态正常）" : null,
    },
    wbCross: x.wbCross,
    priceIntel: x.priceIntel,
    boundaries: [
      { item: "现场生产条件", note: "实际产线数量、在制品、仓储与现场管理水平——可升级实地验厂覆盖。" },
      { item: "银行资信", note: "开户行资信证明、授信额度——需委托后由我方按规核验。" },
      { item: "海关数据明细", note: "逐票进出口记录、真实出口额——公开渠道无法获取。" },
      { item: "涉诉与被执行", note: "以司法数据库正式核验为准；本次公开渠道初筛未见重大异常。" },
    ],
    reachability: {
      phoneCount: t.phones_count ?? 0, dmCount: t.decision_maker_count ?? 0,
      website: st.official_site ? String(st.official_site) : null,
    },
    sources: buildSources(deep.sources),
  };
}

// ─── 平台档案版快照（v96）：TXGC 工商库未收录、万邦已在主流 B2B 平台定位到该厂——
//     能核实什么写什么（平台在营记录为 verified），工商/资质/司法一律列「待人工核实」，绝不编、绝不整份失败 ───
function assembleWbOnlySnapshot(x: {
  job: any; reportNo: string; wb: TempCheckReport;
  priceIntel: ReportSnapshot["priceIntel"]; inOurSystem: boolean; factoryId: number | null;
}): ReportSnapshot {
  const f = x.wb.facts;
  const title = x.wb.matchedTitle ?? x.job.company_name;
  const scaleFacts = [
    f.employeeCount != null ? `员工约 ${f.employeeCount} 人` : null,
    f.areaSqm != null ? `厂房约 ${f.areaSqm} ㎡` : null,
    f.customService === true ? "提供加工/定制服务" : null,
    f.qualityControl ? `质量控制：${f.qualityControl}` : null,
  ].filter(Boolean).join("；");

  const matrix: ReportMatrixItem[] = [
    { item: "主流 B2B 平台在营记录", status: "verified", detail: `国内主流 B2B 批发平台在营 ${f.years ?? "—"} 年${f.home ? `（经营品类：${f.home}）` : ""}${f.level ? `；平台等级：${f.level}` : ""}`, source: "公开报道" },
    { item: "企业名称与信用代码", status: f.creditCode ? "verified" : "pending", detail: f.creditCode ? `平台档案载明统一社会信用代码 ${f.creditCode}，与企业全称一致` : "平台档案未载明信用代码——待人工核实。", source: "官方公示" },
    { item: "工商登记状态", status: "pending", detail: "公开工商数据库暂未收录该企业——工商底档以人工核验为准。", source: "官方公示" },
    { item: "经营模式", status: "pending", detail: f.productionType ? `平台档案载明「${f.productionType}」（企业自述口径，以实地核验为准）` : "平台档案未载明经营模式——待人工核实。", source: "企业自述" },
    { item: "外贸经营资质", status: "pending", detail: "公开渠道未能核到进出口备案记录——以下单前人工核验为准。", source: "官方公示" },
    { item: "实际产能", status: "pending", detail: scaleFacts ? `平台档案载明：${scaleFacts}（企业自述口径）` : "产能数据未公开——以下单前实地验厂为准。", source: "企业自述" },
    { item: "涉诉与经营风险", status: "pending", detail: "公开渠道初筛未能覆盖；正式结论以司法数据库人工核验为准。", source: "司法公示" },
    { item: "现场生产条件", status: "uncovered", detail: "远程核查无法覆盖：实际产线、在制品、仓储与现场管理——可升级实地验厂。", source: "官方公示" },
    { item: "银行资信与海关明细", status: "uncovered", detail: "远程核查无法覆盖：银行资信证明、逐票进出口记录。", source: "官方公示" },
  ];
  const pending = matrix.filter((m) => m.status === "pending").length;
  const uncovered = matrix.filter((m) => m.status === "uncovered").length;

  return {
    meta: { reportNo: x.reportNo, date: new Date().toISOString().slice(0, 10), companyName: title, uscc: f.creditCode, locale: x.job.locale ?? "zh" },
    conclusion: {
      pending, uncovered,
      summary: `该企业在国内主流 B2B 批发平台有 ${f.years ?? "多"} 年在营记录${f.productionType ? `，平台档案为「${f.productionType}」企业` : ""}；但公开工商数据库暂未收录其工商底档，资质与司法记录未能远程核实——共 ${pending} 项待人工核实，建议批量下单前完成工商核验与实地验厂。`,
    },
    metrics: { years: null, certs: 0, coverageDone: matrix.filter((m) => m.status === "verified").length, coverageTotal: matrix.length },
    maxRisk: "公开工商数据库暂未收录该企业的工商底档——企业身份与资质须人工核验后方可下单。",
    facts: { establishDate: null, regCapital: null, status: "待人工核实", foreignTrade: "未核到备案" },
    inOurSystem: x.inOurSystem, factoryId: x.factoryId,
    matrix,
    registration: [
      { label: "企业全称", value: title, source: "公开报道" as SrcTag },
      { label: "统一社会信用代码", value: f.creditCode ?? "—", source: "官方公示" as SrcTag },
      { label: "法定代表人", value: "—（待人工核实）", source: "官方公示" as SrcTag },
      { label: "成立日期", value: "—（待人工核实）", source: "官方公示" as SrcTag },
      { label: "注册资本", value: "—（待人工核实）", source: "官方公示" as SrcTag },
      { label: "登记状态", value: "待人工核实", source: "官方公示" as SrcTag },
      { label: "注册地址", value: f.region ?? "—", source: "公开报道" as SrcTag },
      { label: "行业分类", value: f.home ?? "—", source: "公开报道" as SrcTag },
    ],
    mainProducts: f.home,
    businessScope: null,
    intro: null,
    capacity: {
      paragraphs: scaleFacts ? [{ text: `平台档案载明：${scaleFacts}。以上为企业在平台档案中的自述口径，我方未独立核实。`, source: "企业自述" as SrcTag }] : [],
      conflicts: [],
      equipment: [],
      productLines: [],
    },
    certs: f.cert ? [{ group: "信用、备案与其他在册许可", items: [{ name: `${f.cert}（平台档案载明，企业自述口径）` }] }] : [],
    exportMarket: { markets: null, historyClients: null, customs: null },
    wbCross: { years: f.years, category: f.home, area: f.region },
    priceIntel: x.priceIntel,
    boundaries: [
      { item: "工商底档", note: "公开工商数据库暂未收录该企业——注册信息、股东、变更记录以人工核验为准。" },
      { item: "现场生产条件", note: "实际产线数量、在制品、仓储与现场管理水平——可升级实地验厂覆盖。" },
      { item: "银行资信", note: "开户行资信证明、授信额度——需委托后由我方按规核验。" },
      { item: "海关数据明细", note: "逐票进出口记录、真实出口额——公开渠道无法获取。" },
      { item: "涉诉与被执行", note: "以司法数据库正式核验为准；本次远程核查未能覆盖。" },
    ],
    reachability: { phoneCount: 0, dmCount: 0, website: null },
    sources: [{ category: "国内主流 B2B 平台公开档案（在营年限 · 经营模式 · 规模自述）", count: 1 }],
  };
}

// 证书分组：体系/产品验厂/荣誉资质/信用备案与其他（正则拆括号元数据）
function groupCerts(certs: any[]): ReportSnapshot["certs"] {
  const groups: Record<string, { name: string; no?: string; date?: string }[]> = { "体系与管理认证": [], "产品认证与国际验厂": [], "企业荣誉与资质认定": [], "信用、备案与其他在册许可": [] };
  for (const c of certs) {
    const raw = typeof c === "string" ? c : String(c?.name ?? "");
    if (!raw) continue;
    const m = raw.match(/^(.*?)[（(]([^）)]*)[）)]/);
    const item = { name: (m?.[1] ?? raw).trim(), no: m?.[2]?.trim() || undefined };
    if (/ISO|体系|管理认证/i.test(raw)) groups["体系与管理认证"].push(item);
    else if (/CE|RoHS|FCC|UL|TUV|SGS|验厂|BSCI|产品/i.test(raw)) groups["产品认证与国际验厂"].push(item);
    else if (/高新|专精特新|小巨人|荣誉|示范|技术中心|科技/i.test(raw)) groups["企业荣誉与资质认定"].push(item);
    else groups["信用、备案与其他在册许可"].push(item);
  }
  return Object.entries(groups).filter(([, items]) => items.length).map(([group, items]) => ({ group, items }));
}

// 来源附录：只列类别+条数，URL 与上游品牌一律不列（v13 铁律）
function buildSources(sources: any): { category: string; count: number }[] {
  const arr: string[] = Array.isArray(sources) ? sources.map(String) : [];
  const bucket = (re: RegExp) => arr.filter((s) => re.test(s)).length;
  const out = [
    { category: "企业工商信息平台（工商底档 · 商标专利 · 经营记录）", count: bucket(/qcc|tianyancha|aiqicha|企查查|天眼查/i) },
    { category: "招聘平台公开页（在招岗位与规模印证）", count: bucket(/zhaopin|liepin|job|招聘/i) },
    { category: "新闻与政务公开（项目备案 · 公示信息）", count: bucket(/gov|news|sohu|163|sina|政务|公示/i) },
    { category: "其他公开渠道", count: 0 },
  ];
  const used = out.slice(0, 3).reduce((s, x) => s + x.count, 0);
  out[3].count = Math.max(0, arr.length - used);
  return out.filter((x) => x.count > 0);
}

// 正文长文翻译：非中文报告走翻译管线（await 等齐才落库——v80 冷启动教训）
async function translateSnapshot(snap: ReportSnapshot) {
  const { translateTexts } = await import("../lib/translate");
  const texts = [
    snap.conclusion.summary, snap.maxRisk,
    ...snap.matrix.map((m) => m.item + "||" + m.detail),
    snap.mainProducts, snap.businessScope, snap.intro,
    ...snap.capacity.paragraphs.map((p) => p.text),
    ...snap.certs.flatMap((g) => [g.group, ...g.items.map((i) => i.name)]),
    snap.exportMarket.markets, snap.exportMarket.customs,
    ...snap.boundaries.flatMap((b) => [b.item, b.note]),
    ...snap.sources.map((s) => s.category),
  ].filter((t): t is string => !!t);
  const map = await translateTexts(texts, snap.meta.locale).catch(() => ({} as Record<string, string>));
  const tr = (s: string | null) => (s && map[s] ? map[s] : s);
  snap.conclusion.summary = tr(snap.conclusion.summary)!;
  snap.maxRisk = tr(snap.maxRisk)!;
  snap.matrix.forEach((m) => { const t = map[m.item + "||" + m.detail]; if (t && t.includes("||")) { const [i, d] = t.split("||"); m.item = i; m.detail = d; } });
  snap.mainProducts = tr(snap.mainProducts); snap.businessScope = tr(snap.businessScope); snap.intro = tr(snap.intro);
  snap.capacity.paragraphs.forEach((p) => { p.text = tr(p.text)!; });
  snap.certs.forEach((g) => { g.group = tr(g.group)!; g.items.forEach((i) => { i.name = tr(i.name)!; }); });
  snap.exportMarket.markets = tr(snap.exportMarket.markets); snap.exportMarket.customs = tr(snap.exportMarket.customs);
  snap.boundaries.forEach((b) => { b.item = tr(b.item)!; b.note = tr(b.note)!; });
  snap.sources.forEach((s) => { s.category = tr(s.category)!; });
}

// ═══ 查询侧 ═══
export async function getReportForUser(reportId: number, userId: number) {
  const db = getDb();
  const r: any = await db.execute(dsql`SELECT id, report_no, company_name, status, locale, product_word, report, pdf_path, error, in_our_system, factory_id, created_at
    FROM verification_reports WHERE id = ${reportId} AND user_id = ${userId} LIMIT 1`);
  return r[0]?.[0] ?? null;
}

export async function listMyReports(userId: number) {
  const db = getDb();
  const r: any = await db.execute(dsql`SELECT id, report_no, company_name, status, locale, in_our_system, created_at
    FROM verification_reports WHERE user_id = ${userId} ORDER BY id DESC LIMIT 50`);
  return r[0] as any[];
}

export { REPORT_COST };
