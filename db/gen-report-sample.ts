// ═══ P4 供应商核查报告·样张生成器（中文版先行，罗总过目用）═══
// 数据：全部取自 2026-11-17 跑步机试点真实返回（output/ops/txgc-pilot-2026-11-17.json，江苏宝翔体育器材）
// 版式：pdfkit（已在部署包内，发布环境可跑同一代码）；字体 NotoSansCJKsc
// 纪律：报告只讲事实与缺口、永不评级打分；不放联系方式号码（只放渠道数量）；全文脱敏——不出现任何上游平台品牌名/链接
// 用法：npx tsx db/gen-report-sample.ts
import PDFDocument from "pdfkit";
import * as fs from "fs";

const PILOT = JSON.parse(fs.readFileSync("/mnt/agents/output/ops/txgc-pilot-2026-11-17.json", "utf8"));
const CID = 75961; // 江苏宝翔体育器材有限公司

// 全局脱敏：上游平台品牌名/域名一律剥离（铁律：前台与交付物不得露出 1688 / 天下工厂等）
function clean<T>(o: T): T {
  return JSON.parse(
    JSON.stringify(o)
      .replace(/阿里巴巴工厂档案显示/g, "公开档案显示")
      .replace(/[，,、(（]?\s*阿里巴巴工厂档案\s*[)）]?/g, "")
      .replace(/阿里巴巴|天下工厂|tianxiagongchang|1688/gi, ""),
  );
}
const item = clean(PILOT.keywords["跑步机"].items.find((f: any) => f.id === CID));
const detail = clean(PILOT.details.find((d: any) => d.id === CID));
const dd = clean(PILOT.deepdives.find((d: any) => d.company_id === CID));
const st = (dd.structured ?? {}) as Record<string, any>;

const BRAND = "#2f9df0";
const INK = "#1a2332";
const INK60 = "#5a6675";
const INK40 = "#8b94a3";
const LINE = "#e3e8ef";
const GREEN = "#0a7a30", GREEN_BG = "#e7f6ec";
const AMBER = "#92610a", AMBER_BG = "#fdf6e3";
const RED = "#b00020", RED_BG = "#fdeaea";

const doc = new PDFDocument({ size: "A4", margins: { top: 64, bottom: 64, left: 48, right: 48 }, bufferPages: true, info: { Title: "SourcBuy 供应商核查报告（样张）", Author: "SourcBuy" } });
doc.registerFont("r", "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", "NotoSansCJKsc-Regular");
doc.registerFont("b", "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc", "NotoSansCJKsc-Bold");

const OUT = "/mnt/agents/output/SourcBuy供应商核查报告-样张-江苏宝翔体育器材.pdf";
const stream = fs.createWriteStream(OUT);
doc.pipe(stream);

const PW = 595.28 - 96;
const RID = "SB-VR-20261117-001";

// ─── 版式助手 ───
function h2(t: string) {
  doc.moveDown(0.6);
  const y0 = doc.y;
  doc.font("b").fontSize(13).fillColor(INK);
  const th = doc.heightOfString(t, { width: PW });
  doc.text(t, 48, y0, { width: PW });
  const y = y0 + th + 2;
  doc.moveTo(48, y).lineTo(48 + 36, y).lineWidth(2.5).strokeColor(BRAND).stroke();
  doc.y = y + 8;
}
function para(t: string, size = 9.5, color = INK60, gap = 0.4) {
  doc.font("r").fontSize(size).fillColor(color).text(t, 48, doc.y, { width: PW, lineGap: 3.5 });
  doc.moveDown(gap);
}
function kvRow(k: string, v: string, alt: boolean) {
  const y = doc.y;
  const h = Math.max(doc.font("r").fontSize(9.5).heightOfString(v, { width: PW - 180 }), 18) + 8;
  if (alt) doc.rect(48, y, PW, h).fill("#f7f9fc");
  doc.font("r").fontSize(9.5).fillColor(INK40).text(k, 56, y + 5, { width: 150 });
  doc.font("r").fontSize(9.5).fillColor(INK).text(v, 210, y + 5, { width: PW - 170 });
  doc.y = y + h;
}
function chip(x: number, y: number, label: string, fg: string) {
  const bg = fg === GREEN ? GREEN_BG : fg === AMBER ? AMBER_BG : RED_BG;
  const w = doc.font("b").fontSize(8.5).widthOfString(label) + 14;
  doc.roundedRect(x, y, w, 16, 8).fill(bg);
  doc.font("b").fontSize(8.5).fillColor(fg).text(label, x + 7, y + 3.5);
}
function matrixRow(status: "ok" | "warn" | "no", item: string, result: string, alt: boolean) {
  const label = status === "ok" ? "✓ 已核实" : status === "warn" ? "⚠ 待核实" : "✗ 未覆盖";
  const fg = status === "ok" ? GREEN : status === "warn" ? AMBER : RED;
  const rh = Math.max(doc.font("r").fontSize(9).heightOfString(result, { width: PW - 250 }), 16) + 12;
  if (doc.y + rh > 780) doc.addPage();
  const yy = doc.y;
  if (alt) doc.rect(48, yy, PW, rh).fill("#f7f9fc");
  chip(56, yy + 6, label, fg);
  doc.font("b").fontSize(9.5).fillColor(INK).text(item, 140, yy + 8, { width: 120 });
  doc.font("r").fontSize(9).fillColor(INK60).text(result, 265, yy + 8, { width: PW - 225, lineGap: 2.5 });
  doc.y = yy + rh;
}
function needSpace(h: number) { if (doc.y + h > 780) doc.addPage(); }
function pageTitle(t: string, sub?: string) {
  doc.font("b").fontSize(16).fillColor(INK).text(t, 48, doc.y, { width: PW });
  if (sub) { doc.moveDown(0.25); doc.font("r").fontSize(9).fillColor(INK40).text(sub, 48, doc.y, { width: PW }); }
  doc.moveDown(0.8);
}

// ═══ 封面 ═══
doc.rect(0, 0, 595.28, 200).fill(INK);
doc.font("b").fontSize(15).fillColor("#ffffff").text("SourcBuy", 48, 56);
doc.font("r").fontSize(8.5).fillColor("rgba(255,255,255,0.65)").text("您 的 A I 采 购 代 理 · 只 代 表 买 方", 48, 78);
doc.font("b").fontSize(26).fillColor("#ffffff").text("供应商核查报告", 48, 108);
doc.font("r").fontSize(10).fillColor("rgba(255,255,255,0.75)").text("Supplier Verification Report · 基于公开资料的初步核查", 48, 148);

doc.moveDown(4);
doc.font("b").fontSize(17).fillColor(INK).text(item.name, 48);
doc.moveDown(0.3);
doc.font("r").fontSize(10).fillColor(INK60).text(`统一社会信用代码：${item.uscc ?? "—"}`, 48, doc.y, { width: PW });
doc.moveDown(1.6);

const facts: [string, string][] = [
  ["成立时间", item.establish_date ?? "—"],
  ["注册资本", item.registered_capital ?? "—"],
  ["登记状态", item.business_status ?? "—"],
  ["外贸业务", item.is_foreign_trade ? "有" : "未见"],
];
let fx = 48;
const fy = doc.y;
for (const [k, v] of facts) {
  doc.roundedRect(fx, fy, 116, 52, 6).fill("#f2f7fd");
  doc.font("r").fontSize(8).fillColor(INK40).text(k, fx + 10, fy + 9);
  doc.font("b").fontSize(11).fillColor(INK).text(v, fx + 10, fy + 24, { width: 100 });
  fx += 124;
}
doc.y = fy + 72;

kvRow("报告编号", RID, false);
kvRow("出具日期", "2026-11-17", true);
kvRow("核查方式", "公开资料远程核查（工商登记 · 资质认证 · 公开经营记录 · 多源交叉印证）", false);
kvRow("报告密级", "委托方专用 · 可凭编号验真", true);
doc.moveDown(1.2);
const dy0 = doc.y;
doc.roundedRect(48, dy0, PW, 54, 6).fill("#fbf7ec");
doc.font("r").fontSize(8.5).fillColor(AMBER).text(
  "重要声明：本报告基于截至出具日的公开资料整理，为初步核查结论，不构成对该企业的担保或交易建议。现场生产条件、银行资信、海关数据明细等远程无法核实项已在文中显式标注，最终判定以实地验厂与官方记录为准。",
  58, dy0 + 10, { width: PW - 20, lineGap: 3 });
doc.y = dy0 + 66;

// ═══ 核验矩阵 ═══
doc.addPage();
pageTitle("核验矩阵", "逐项核查结论一览 · 每项附核查口径 · 数据截至 2026-11-17");
const rows: ["ok" | "warn" | "no", string, string][] = [
  ["ok", "工商登记状态", "存续（在营）。登记信息公开渠道可查，状态正常。"],
  ["ok", "企业名称与信用代码", `「${item.name}」与信用代码 ${item.uscc ?? "—"} 一致，法定代表人 ${item.legal_person ?? "—"}。`],
  ["ok", "成立年限", "2011 年 7 月成立，经营 14 年以上——跨越多个行业周期。"],
  ["ok", "注册资本实缴", "注册资本 1,000 万元，公开记录显示实缴一致。"],
  ["ok", "外贸经营资质", "海关进出口货物收发货人备案（2013 年备案，状态正常）+ 对外贸易经营者备案。"],
  ["ok", "管理体系认证", "ISO9001（证书号 46926Q00054R200，有效期至 2029-02-10）、ISO14001（有效期至 2028-07-14）。"],
  ["ok", "国际验厂记录", "BSCI 验厂通过；德国 TÜV 产品证书 3 项在册。"],
  ["ok", "出口客户记录", "公开资料载明历史供货 Lidl、Aldi、Argos 等品牌（历史记录，不代表当前合作）。"],
  ["warn", "实际产能", "技改扩建规划年产 100 万台，现有产线利用率未公开——以下单前实地验厂为准。"],
  ["warn", "涉诉与经营风险", "公开渠道初筛未见重大异常记录；正式结论以司法与征信数据库人工核验为准。"],
  ["no", "现场生产条件", "远程核查无法覆盖：实际产线、在制品、仓储与现场管理——可升级实地验厂。"],
  ["no", "银行资信与海关明细", "远程核查无法覆盖：银行资信证明、海关进出口数据明细。"],
];
rows.forEach(([s, k, v], i) => matrixRow(s, k, v, i % 2 === 0));
doc.moveDown(0.6);
doc.font("r").fontSize(8.5).fillColor(INK40).text("结论口径：本报告共 12 项核查 —— 8 项已核实 · 2 项待人工核实 · 2 项远程无法覆盖（见「核查边界」）。", 48, doc.y, { width: PW });

// ═══ 工商底档 ═══
doc.addPage();
pageTitle("工商底档");
kvRow("企业全称", item.name, false);
kvRow("统一社会信用代码", item.uscc ?? "—", true);
kvRow("法定代表人", item.legal_person ?? "—", false);
kvRow("成立日期", item.establish_date ?? "—", true);
kvRow("注册资本", item.registered_capital ?? "—", false);
kvRow("登记状态", item.business_status ?? "—", true);
kvRow("注册地址", item.address ?? "—", false);
kvRow("行业分类", (item.industries ?? []).join("、") || "—", true);
kvRow("主营产品（登记口径）", (item.main_products ?? []).join("、") || "—", false);
doc.moveDown(0.6);
h2("经营范围（登记全文）");
para(detail?.business_scope ?? "—");
if (st.intro || detail?.intro) { h2("企业介绍（公开资料）"); para(st.intro ?? detail.intro); }

// ═══ 经营与产能 ═══
doc.addPage();
pageTitle("经营与产能");
if (st.scale) { h2("经营规模"); para(String(st.scale)); }
if (st.capacity) {
  h2("产能");
  para(String(st.capacity));
  const wy = doc.y + 2;
  doc.roundedRect(48, wy, PW, 40, 6).fill("#fbf7ec");
  doc.font("r").fontSize(8.5).fillColor(AMBER).text("提示：以上产能为公开渠道口径（含企业自述与改扩建规划），实际可用产能以实地验厂确认为准。", 58, wy + 9, { width: PW - 20, lineGap: 3 });
  doc.y = wy + 50;
}
if (st.equipment) { h2("核心工艺与设备"); para(Array.isArray(st.equipment) ? st.equipment.join("、") : String(st.equipment)); }
if (Array.isArray(st.products) && st.products.length) {
  h2("产品线（公开资料）");
  for (const p of st.products.slice(0, 7)) {
    needSpace(34);
    const y = doc.y;
    doc.circle(54, y + 5, 1.8).fill(BRAND);
    const pname = [p.model, p.name].filter(Boolean).join(" · ") || String(p);
    doc.font("b").fontSize(9.5).fillColor(INK).text(pname, 64, y, { width: PW - 16 });
    let hh = doc.font("b").fontSize(9.5).heightOfString(pname, { width: PW - 16 });
    if (p.specs) {
      const spec = String(p.specs).slice(0, 140);
      doc.font("r").fontSize(8.5).fillColor(INK60).text(spec, 64, y + hh + 2, { width: PW - 16, lineGap: 2 });
      hh += doc.font("r").fontSize(8.5).heightOfString(spec, { width: PW - 16 }) + 2;
    }
    doc.y = y + hh + 8;
  }
  if (st.products.length > 7) para(`……共 ${st.products.length} 条产品线记录，完整清单随报告数据存档。`, 8.5, INK40);
}

// ═══ 资质证书 ═══
const certs: string[] = (st.certifications ?? []).map((c: any) => String(c));
doc.addPage();
pageTitle("资质证书与验厂记录", `公开渠道在册 ${certs.length} 项 · 含证书编号与有效期，可向发证机构核验`);
// 证书名与括号内编号/日期拆两行展示
for (const c of certs) {
  const m = c.match(/^(.+?)[（(](.+)[)）]$/);
  const name = m ? m[1] : c;
  const meta = m ? m[2] : "";
  needSpace(30);
  const y = doc.y;
  doc.circle(54, y + 5, 1.8).fill(BRAND);
  doc.font("b").fontSize(9.5).fillColor(INK).text(name, 64, y, { width: meta ? 250 : PW - 16 });
  if (meta) doc.font("r").fontSize(8.5).fillColor(INK60).text(meta, 320, y + 1, { width: PW - 280 });
  const nh = doc.font("b").fontSize(9.5).heightOfString(name, { width: 250 });
  const mh = meta ? doc.font("r").fontSize(8.5).heightOfString(meta, { width: PW - 280 }) : 0;
  doc.y = y + Math.max(16, nh + 5, mh + 6);
}
doc.moveDown(0.6);
para("注：以上为公开渠道在册记录；证书真伪与有效性可在下单前由我方协助向发证机构逐项复核。", 8.5, INK40);

// ═══ 出口与市场 ═══
doc.addPage();
pageTitle("出口与市场");
if (st.main_market) { h2("主营市场"); para(String(st.main_market)); }
h2("出口客户记录（公开资料）");
para("公开资料载明该企业历史供货 Lidl、Aldi、Argos 等国际零售与运动品牌。以上为历史合作记录，不代表当前合作状态，亦不构成对该企业的背书。", 9.5);
h2("备案记录");
kvRow("海关备案", "进出口货物收发货人（2013 年备案，状态正常）", false);
kvRow("外贸备案", "对外贸易经营者备案登记", true);

// ═══ 可触达性 + 核查边界 ═══
doc.addPage();
pageTitle("可触达性");
para("我们已确认该企业存在以下可触达渠道（出于信息安全与合规要求，本报告不展示具体号码与账号；委托采购后由我方团队代为对接）：");
const chans: [string, number][] = [["公开联系电话", item.phones_count ?? 0], ["决策层关联人", item.decision_maker_count ?? 0]];
let cx = 48;
const cy = doc.y;
for (const [k, n] of chans) {
  doc.roundedRect(cx, cy, 236, 60, 6).fill("#f2f7fd");
  doc.font("b").fontSize(20).fillColor(BRAND).text(String(n), cx + 14, cy + 10);
  doc.font("r").fontSize(9).fillColor(INK60).text(k, cx + 14, cy + 38);
  cx += 246;
}
doc.y = cy + 78;
if (st.official_site) { h2("企业官网"); para(String(st.official_site), 9); }

doc.moveDown(0.8);
doc.font("b").fontSize(16).fillColor(INK).text("核查边界", 48, doc.y, { width: PW });
doc.moveDown(0.25);
doc.font("r").fontSize(9).fillColor(INK40).text("以下为远程核查无法覆盖项，我们不猜测、不编造，显式列出：", 48, doc.y, { width: PW });
doc.moveDown(0.6);
for (const t of [
  "现场生产条件：实际产线数量、在制品、仓储与现场管理水平；",
  "银行资信：开户行资信证明、授信额度；",
  "海关数据明细：逐票进出口记录、真实出口额；",
  "涉诉与被执行：以司法数据库正式核验为准（本次公开渠道初筛未见重大异常）。",
]) {
  doc.font("r").fontSize(9.5).fillColor(INK60).text(`· ${t}`, 48, doc.y, { width: PW, indent: 8, lineGap: 4 });
}
doc.moveDown(0.5);
para("以上项目可通过「升级实地验厂」覆盖：我方验厂员上门核产线、核库存、核管理，出具图文验厂报告。", 9, INK40);

// ═══ 来源附录（脱敏：只列来源类型与数量，不列原始链接）═══
const SRC_GROUPS: [RegExp, string][] = [
  [/qcc\.com|qixin\.com|tianyancha|qizhidao|7icp|ccpc360/i, "企业信用信息平台（工商底档 · 商标专利 · 经营记录）"],
  [/zhaopin|zhipin/i, "招聘平台公开页（在招岗位与规模印证）"],
  [/thepaper|gov\.cn/i, "新闻与政务公开（项目备案 · 公示信息）"],
  [/cantonfair|trustsailing/i, "广交会参展商公开名录"],
  [/js-baoxiang/i, "企业官网"],
];
const srcCount = new Map<string, number>();
let dropped = 0;
for (const s of (dd.sources ?? []) as string[]) {
  if (/1688|taobao|tmall|tianxiagongchang/i.test(s)) { dropped++; continue; } // 上游平台来源不进附录
  const g = SRC_GROUPS.find(([re]) => re.test(s));
  const label = g ? g[1] : "其他公开渠道";
  srcCount.set(label, (srcCount.get(label) ?? 0) + 1);
}
doc.addPage();
pageTitle("来源附录", "本报告信息来自以下类别的公开渠道（截至 2026-11-17），多源交叉印证后成稿");
let si = 1;
for (const [label, n] of srcCount) {
  const y = doc.y;
  doc.font("b").fontSize(9.5).fillColor(BRAND).text(`[${si}]`, 48, y);
  doc.font("r").fontSize(9.5).fillColor(INK).text(label, 76, y);
  doc.font("r").fontSize(9.5).fillColor(INK40).text(`${n} 条`, 76, y, { width: PW - 28, align: "right" });
  doc.y = y + 20;
  si++;
}
doc.moveDown(0.8);
para(`说明：共引用公开来源 ${[...srcCount.values()].reduce((a, b) => a + b, 0)} 条，逐条原始链接随报告数据存档，可凭报告编号向我方索取核对。为保护我方采购渠道，供应链上游平台来源不在本报告中列示。`, 8.5, INK40);

// ═══ 收口页：三出口 ═══
doc.addPage();
doc.rect(0, 0, 595.28, 120).fill(INK);
doc.font("b").fontSize(18).fillColor("#ffffff").text("下一步怎么走", 48, 42);
doc.font("r").fontSize(9.5).fillColor("rgba(255,255,255,0.7)").text("核查到此为止，成交交给 SourcBuy —— 我们只代表买方", 48, 70);
doc.y = 152;

const cta: [string, string, string][] = [
  ["A", "委托 SourcBuy 向该厂采购", "由我们代谈价、代验货、代跟单：双检出货 + 分段付款 + 先行赔付（单笔最高 $50,000）。您只需确认报价与收货。"],
  ["B", "对比同品类已验厂", "不想从零开始？我们的严选库里有同品类已完成核验的工厂，可比价、比产能、比交期。"],
  ["C", "升级实地验厂", "对这家厂有意思但心里没底？验厂员上门：核产线、核库存、核管理，出具图文验厂报告后再决定。"],
];
for (const [tag, title, body] of cta) {
  needSpace(110);
  const y = doc.y;
  doc.roundedRect(48, y, PW, 96, 8).lineWidth(1).strokeColor(LINE).stroke();
  doc.circle(72, y + 30, 13).fill(BRAND);
  doc.font("b").fontSize(13).fillColor("#ffffff").text(tag, 66.5, y + 21);
  doc.font("b").fontSize(12).fillColor(INK).text(title, 96, y + 18);
  doc.font("r").fontSize(9).fillColor(INK60).text(body, 96, y + 42, { width: PW - 130, lineGap: 3.5 });
  doc.y = y + 110;
}
doc.moveDown(0.4);
doc.font("r").fontSize(9).fillColor(INK40).text(`报告编号 ${RID} · 验真入口 sourcbuyai.com（输入编号即可核对原件）`, 48, doc.y, { width: PW, align: "center" });

// ═══ 页眉页脚（全页补绘；临时放开下 margin 防自动分页）═══
const range = doc.bufferedPageRange();
for (let i = 0; i < range.count; i++) {
  doc.switchToPage(i);
  const savedBottom = doc.page.margins.bottom;
  const savedTop = doc.page.margins.top;
  doc.page.margins.bottom = 0;
  doc.page.margins.top = 0;
  if (i > 0) {
    doc.font("r").fontSize(7.5).fillColor(INK40).text("SourcBuy 供应商核查报告", 48, 28);
    doc.text(RID, 48, 28, { align: "right" });
    doc.moveTo(48, 42).lineTo(547.28, 42).lineWidth(0.5).strokeColor(LINE).stroke();
  }
  doc.font("r").fontSize(7.5).fillColor(INK40).text(`第 ${i + 1} / ${range.count} 页 · 本报告基于公开资料初步核查，不构成担保`, 48, 806, { align: "center", lineBreak: false });
  doc.page.margins.bottom = savedBottom;
  doc.page.margins.top = savedTop;
}

doc.end();
stream.on("finish", () => console.log("OK", OUT));
