// ═══ P4 供应商核查报告·样张 v2（结论先行版，吸收 workBuddy 诊断）═══
// v2 变更：首屏决策卡（结论先行但永不评级）/ 矩阵风险项前置+来源角标 / 未覆盖改中性灰 /
//          数据口径冲突显式标注 / 证书三列表格分组 / 历史客户降权 / 边界前置 / 可触达性降权 / 附录可信度分级
// 数据：全部取自 2026-11-17 跑步机试点真实返回（江苏宝翔体育器材）
// 纪律：只讲事实与缺口、永不评级打分；渠道只放数量；全文脱敏——不出现任何上游平台品牌名/链接
import PDFDocument from "pdfkit";
import * as fs from "fs";

const PILOT = JSON.parse(fs.readFileSync("/mnt/agents/output/ops/txgc-pilot-2026-11-17.json", "utf8"));
const CID = 75961; // 江苏宝翔体育器材有限公司

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

const NAVY = "#12233c"; // 封面深蓝（比正文墨色更深的品牌底色）
const BRAND = "#2f9df0";
const INK = "#1a2332";
const INK60 = "#5a6675";
const INK40 = "#8b94a3";
const LINE = "#e3e8ef";
const GREEN = "#0a7a30", GREEN_BG = "#e7f6ec";
const AMBER = "#92610a", AMBER_BG = "#fdf6e3";
const RED = "#b00020", RED_BG = "#fdeaea";
const GRAY = "#6b7688", GRAY_BG = "#eef1f5"; // 未覆盖=中性灰，红色只留真实负面

type SrcTag = "官方公示" | "司法公示" | "公开报道" | "企业自述";
const SRC_COLOR: Record<SrcTag, string> = { 官方公示: "#1f6fb2", 司法公示: "#5b3fa8", 公开报道: "#92610a", 企业自述: "#6b7688" };

const doc = new PDFDocument({ size: "A4", margins: { top: 64, bottom: 64, left: 48, right: 48 }, bufferPages: true, info: { Title: "SourcBuy 供应商核查报告 v2（样张）", Author: "SourcBuy" } });
doc.registerFont("r", "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", "NotoSansCJKsc-Regular");
doc.registerFont("b", "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc", "NotoSansCJKsc-Bold");

const OUT = "/mnt/agents/output/SourcBuy供应商核查报告-样张v2-江苏宝翔体育器材.pdf";
const stream = fs.createWriteStream(OUT);
doc.pipe(stream);

const PW = 595.28 - 96;
const RID = "SB-VR-20261117-001";

// ─── 版式助手 ───
function srcTag(x: number, y: number, t: SrcTag) {
  doc.font("r").fontSize(7.5).fillColor(SRC_COLOR[t]);
  const w = doc.widthOfString(`〔${t}〕`);
  doc.text(`〔${t}〕`, x - w, y + 1.5, { lineBreak: false });
}
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
function para(t: string, size = 9.5, color = INK60, gap = 0.4, tag?: SrcTag) {
  const y = doc.y;
  const w = tag ? PW - 70 : PW;
  doc.font("r").fontSize(size).fillColor(color);
  const th = doc.heightOfString(t, { width: w, lineGap: 3.5 });
  doc.text(t, 48, y, { width: w, lineGap: 3.5 });
  if (tag) srcTag(48 + PW, y, tag);
  doc.y = y + th + gap * 12; // 手动推进：srcTag 的 lineBreak:false 会把 doc.y 拉回段落开头
}
function kvRow(k: string, v: string, alt: boolean, tag?: SrcTag) {
  const y = doc.y;
  const vw = PW - 180 - (tag ? 64 : 0);
  const h = Math.max(doc.font("r").fontSize(9.5).heightOfString(v, { width: vw }), 18) + 8;
  if (alt) doc.rect(48, y, PW, h).fill("#f7f9fc");
  doc.font("r").fontSize(9.5).fillColor(INK40).text(k, 56, y + 5, { width: 150 });
  doc.font("r").fontSize(9.5).fillColor(INK).text(v, 210, y + 5, { width: vw });
  if (tag) srcTag(48 + PW - 8, y + 5, tag);
  doc.y = y + h;
}
function needSpace(h: number) { if (doc.y + h > 780) doc.addPage(); }
function pageTitle(eyebrow: string, t: string, sub?: string) {
  doc.font("b").fontSize(8).fillColor(BRAND).text(eyebrow.toUpperCase().split("").join(" "), 48, doc.y, { width: PW, characterSpacing: 1 });
  doc.moveDown(0.15);
  doc.font("b").fontSize(16).fillColor(INK).text(t, 48, doc.y, { width: PW });
  if (sub) { doc.moveDown(0.25); doc.font("r").fontSize(9).fillColor(INK40).text(sub, 48, doc.y, { width: PW }); }
  doc.moveDown(0.8);
}
function noteBox(text: string, fg = AMBER, bg = "#fbf7ec") {
  doc.font("r").fontSize(8.5);
  const h = doc.heightOfString(text, { width: PW - 20, lineGap: 3 }) + 18;
  if (doc.y + h + 10 > 770) doc.addPage(); // 先换页再取 y，杜绝矩形/正文跨页分离
  const y = doc.y + 2;
  doc.roundedRect(48, y, PW, h, 6).fill(bg);
  doc.fillColor(fg).text(text, 58, y + 9, { width: PW - 20, lineGap: 3 });
  doc.y = y + h + 8;
}

// ═══ 封面 + 首屏决策卡 ═══
doc.rect(0, 0, 595.28, 292).fill(NAVY);
doc.font("b").fontSize(15).fillColor("#ffffff").text("SourcBuy", 48, 50);
doc.font("r").fontSize(8.5).fillColor("rgba(255,255,255,0.65)").text("您 的 A I 采 购 代 理 · 只 代 表 买 方", 48, 72);
doc.font("b").fontSize(24).fillColor("#ffffff").text("供应商核查报告", 48, 100);
doc.font("r").fontSize(9.5).fillColor("rgba(255,255,255,0.72)").text("Supplier Verification Report · 基于公开资料的初步核查", 48, 132);
doc.font("b").fontSize(16).fillColor("#ffffff").text(item.name, 48, 168);
doc.font("r").fontSize(9).fillColor("rgba(255,255,255,0.65)").text(`统一社会信用代码：${item.uscc ?? "—"}`, 48, 194);
// 边界前置一句话（封面声明区）
doc.font("r").fontSize(8).fillColor("rgba(255,255,255,0.6)").text("本报告为远程初步核查：现场产能与司法记录不在覆盖范围，批量下单前可升级实地验厂。", 48, 226);
doc.font("r").fontSize(8).fillColor("rgba(255,255,255,0.6)").text(`报告编号 ${RID} · 出具日期 2026-11-17 · 委托方专用，可凭编号验真`, 48, 242);

// 决策卡（白卡压封底边缘）
const CY = 276;
doc.roundedRect(48, CY, PW, 168, 10).fill("#ffffff").lineWidth(1).strokeColor(LINE).stroke();
doc.font("r").fontSize(8.5).fillColor(INK40).text("核查结论（不评级，只讲事实与缺口）", 66, CY + 16);
doc.font("b").fontSize(13.5).fillColor(INK).text("公开核查未发现异常项 · 2 项待人工核实 · 2 项远程无法覆盖", 66, CY + 32, { width: PW - 32 });
doc.font("r").fontSize(9.5).fillColor(INK60).text("这家厂资质完整、工商记录干净，可作为候选供应商；产能与司法两项在批量下单前补齐核验即可。", 66, CY + 56, { width: PW - 32, lineGap: 3 });
// 三指标
const my = CY + 92;
doc.moveTo(66, my).lineTo(48 + PW - 18, my).lineWidth(0.75).strokeColor(LINE).stroke();
{
  let x = 66;
  for (const [k, v] of [["经营年限", "14 年"], ["在册资质", "18 项"], ["核查覆盖", "8 / 12 项"]] as [string, string][]) {
    doc.font("r").fontSize(8).fillColor(INK40).text(k, x, my + 10, { lineBreak: false });
    doc.font("b").fontSize(15).fillColor(BRAND).text(v, x, my + 24, { lineBreak: false });
    x += 160;
  }
}
// 最大风险提示条
const ry = CY + 132;
doc.roundedRect(58, ry, PW - 20, 26, 5).fill(AMBER_BG);
doc.font("r").fontSize(8.5).fillColor(AMBER).text("最大风险：产能数据含企业自述成分、司法核查远程未覆盖——建议批量下单前升级实地验厂。", 68, ry + 7.5, { width: PW - 40 });
doc.y = CY + 184;

// 声明框
noteBox("重要声明：本报告基于截至出具日的公开资料整理，为初步核查结论，不构成对该企业的担保或交易建议。远程无法核实项已在文中显式标注，最终判定以实地验厂与官方记录为准。");
// 四事实卡（决策依据向）
{
  const fy2 = doc.y + 10;
  const facts: [string, string][] = [
    ["成立时间", item.establish_date ?? "—"],
    ["注册资本（实缴一致）", item.registered_capital ?? "—"],
    ["登记状态", item.business_status ?? "—"],
    ["外贸业务", item.is_foreign_trade ? "有（2013 年备案）" : "未见"],
  ];
  let fx = 48;
  for (const [k, v] of facts) {
    doc.roundedRect(fx, fy2, 116, 54, 6).fill("#f2f7fd");
    doc.font("r").fontSize(7.5).fillColor(INK40).text(k, fx + 10, fy2 + 8, { width: 100 });
    doc.font("b").fontSize(10.5).fillColor(INK).text(v, fx + 10, fy2 + 24, { width: 100 });
    fx += 124;
  }
  doc.y = fy2 + 66;
}

// ═══ 核验矩阵（风险前置 + 来源角标）═══
doc.addPage();
pageTitle("Verification Matrix", "核验矩阵", "风险项前置 · 每项标注来源口径 · 数据截至 2026-11-17");

// 先看这三项（⚠ 待核实 + 未覆盖）
const att: [string, string, SrcTag | "未覆盖"][] = [
  ["实际产能", "技改扩建规划年产 100 万台，现有产线利用率未公开——以下单前实地验厂为准。", "企业自述"],
  ["涉诉与经营风险", "公开渠道初筛未见重大异常记录；正式结论以司法数据库人工核验为准。", "司法公示"],
];
noteBox("先看这几项：它们是不确定性的集中处，直接影响下单决策——实际产能（企业自述口径）、涉诉与司法核验（远程未覆盖）、银行资信与海关明细（远程未覆盖）。");
for (const [k, v, tag] of att) {
  const y = doc.y;
  const rh = Math.max(doc.font("r").fontSize(9).heightOfString(v, { width: PW - 296 }), 16) + 10;
  chipWarn(56, y + 5, "⚠ 待核实");
  doc.font("b").fontSize(9.5).fillColor(INK).text(k, 136, y + 7, { width: 110 });
  doc.font("r").fontSize(9).fillColor(INK60).text(v, 252, y + 7, { width: PW - 296, lineGap: 2.5 });
  if (tag !== "未覆盖") srcTag(48 + PW, y + 6, tag as SrcTag);
  doc.y = y + rh;
}
for (const [k, v] of [
  ["现场生产条件", "远程核查无法覆盖：实际产线、在制品、仓储与现场管理——可升级实地验厂。"],
  ["银行资信与海关明细", "远程核查无法覆盖：银行资信证明、逐票进出口记录。"],
] as [string, string][]) {
  const y = doc.y;
  const rh = Math.max(doc.font("r").fontSize(9).heightOfString(v, { width: PW - 240 }), 16) + 10;
  chipGray(56, y + 5, "○ 未覆盖");
  doc.font("b").fontSize(9.5).fillColor(INK).text(k, 136, y + 7, { width: 110 });
  doc.font("r").fontSize(9).fillColor(INK60).text(v, 252, y + 7, { width: PW - 240, lineGap: 2.5 });
  doc.y = y + rh;
}
doc.moveDown(0.4);
doc.moveTo(48, doc.y).lineTo(48 + PW, doc.y).lineWidth(0.75).strokeColor(LINE).stroke();
doc.moveDown(0.4);
doc.font("r").fontSize(9).fillColor(INK40).text("已核实 · 官方公示与公开记录", 48, doc.y, { width: PW });
doc.moveDown(0.3);

const okRows: [string, string, SrcTag][] = [
  ["工商登记状态", "存续（在营）。登记信息公开渠道可查，状态正常。", "官方公示"],
  ["企业名称与信用代码", `「${item.name}」与信用代码一致，法定代表人 ${item.legal_person ?? "—"}。`, "官方公示"],
  ["成立年限", "2011 年 7 月成立，经营 14 年以上——跨越多个行业周期。", "官方公示"],
  ["注册资本实缴", "注册资本 1,000 万元，公开记录显示实缴一致。", "官方公示"],
  ["外贸经营资质", "海关进出口货物收发货人备案（2013 年备案，状态正常）+ 对外贸易经营者备案。", "官方公示"],
  ["管理体系认证", "ISO9001（有效期至 2029-02-10）、ISO14001（有效期至 2028-07-14）。", "官方公示"],
  ["国际验厂记录", "BSCI 验厂通过；德国 TÜV 产品证书 3 项在册。", "官方公示"],
  ["出口客户记录", "公开资料载明历史供货 Lidl、Aldi、Argos 等品牌。历史记录，不代表当前合作。", "公开报道"],
];
okRows.forEach(([k, v, tag], i) => {
  const rh = Math.max(doc.font("r").fontSize(9).heightOfString(v, { width: PW - 240 }), 16) + 10;
  if (doc.y + rh > 780) doc.addPage();
  const y = doc.y;
  if (i % 2 === 0) doc.rect(48, y, PW, rh).fill("#f7f9fc");
  chipOk(56, y + 5, "✓ 已核实");
  doc.font("b").fontSize(9.5).fillColor(INK).text(k, 136, y + 7, { width: 110 });
  doc.font("r").fontSize(9).fillColor(INK60).text(v, 252, y + 7, { width: PW - 240, lineGap: 2.5 });
  srcTag(48 + PW, y + 6, tag);
  doc.y = y + rh;
});
doc.moveDown(0.5);
noteBox("本次未发现查实的负面记录——在可及的公开渠道内，未检索到该企业的重大涉诉、失信被执行或行政处罚公示。但此项不等于「司法清白」，完整结论仍需数据库人工核验。", "#1f4e9c", "#eef4fd");
doc.font("r").fontSize(8.5).fillColor(INK40).text("结论口径：本报告共 12 项核查 —— 8 项已核实 · 2 项待人工核实 · 2 项远程无法覆盖。", 48, doc.y, { width: PW });

function chipOk(x: number, y: number, label: string) { chipBase(x, y, label, GREEN, GREEN_BG); }
function chipWarn(x: number, y: number, label: string) { chipBase(x, y, label, AMBER, AMBER_BG); }
function chipGray(x: number, y: number, label: string) { chipBase(x, y, label, GRAY, GRAY_BG); }
function chipBase(x: number, y: number, label: string, fg: string, bg: string) {
  const w = doc.font("b").fontSize(8.5).widthOfString(label) + 14;
  doc.roundedRect(x, y, w, 16, 8).fill(bg);
  doc.font("b").fontSize(8.5).fillColor(fg).text(label, x + 7, y + 3.5, { lineBreak: false });
}

// ═══ 工商底档 ═══
doc.addPage();
pageTitle("Registration Profile", "工商底档", "以下各行均来自官方登记公示渠道");
kvRow("企业全称", item.name, false, "官方公示");
kvRow("统一社会信用代码", item.uscc ?? "—", true, "官方公示");
kvRow("法定代表人", item.legal_person ?? "—", false, "官方公示");
kvRow("成立日期", item.establish_date ?? "—", true, "官方公示");
kvRow("注册资本", item.registered_capital ?? "—", false, "官方公示");
kvRow("登记状态", item.business_status ?? "—", true, "官方公示");
kvRow("注册地址", item.address ?? "—", false, "官方公示");
kvRow("行业分类", (item.industries ?? []).join("、") || "—", true, "官方公示");
kvRow("主营产品（登记口径）", (item.main_products ?? []).join("、") || "—", false, "官方公示");
doc.moveDown(0.6);
h2("经营范围（登记全文）");
para(detail?.business_scope ?? "—", 9.5, INK60, 0.4, "官方公示");
if (st.intro || detail?.intro) {
  h2("企业介绍（公开资料）");
  para(st.intro ?? detail.intro, 9.5, INK60, 0.4, "企业自述");
  noteBox("口径提示：企业介绍含自我评价成分，可作为了解窗口，不作为履约能力证明；客观结论以工商登记、认证证书与验厂结果为准。");
}

// ═══ 经营与产能（口径冲突显式标注）═══
doc.addPage();
pageTitle("Operations & Capacity", "经营与产能");
if (st.scale) { h2("经营规模"); para(String(st.scale)); }
noteBox("数据口径提示：本页数字来自不同口径——「参保 102 人」为社保公示口径〔官方公示〕，「生产人数 151 人」与「人员规模 100–199 人」为企业自述与招聘页口径，三者统计范围不同，不直接矛盾也不相互证明。用地方针：公开出让记录为 2.7148 公顷（约 40.7 亩）〔官方公示〕，与企业自述「占地 100 亩」存在差异——以官方出让记录为准，实际厂区规模以验厂为准。");
if (st.capacity) { h2("产能"); para(String(st.capacity), 9.5, INK60, 0.4, "企业自述"); }
if (st.equipment) { h2("核心工艺与设备"); para(Array.isArray(st.equipment) ? st.equipment.join("、") : String(st.equipment), 9.5, INK60, 0.4, "企业自述"); }
if (Array.isArray(st.products) && st.products.length) {
  h2("产品线（公开资料）");
  for (const p of st.products.slice(0, 6)) {
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
  if (st.products.length > 6) para(`……共 ${st.products.length} 条产品线记录，完整清单随报告数据存档。`, 8.5, INK40);
}

// ═══ 资质证书（三列表格·分组）═══
const certs: string[] = (st.certifications ?? []).map((c: any) => String(c));
function parseCert(c: string): { name: string; no: string; date: string } {
  const m = c.match(/^(.*?)[（(](.*)[)）]\s*$/);
  const name = (m ? m[1] : c).trim();
  const meta = m ? m[2] : "";
  const noM = meta.match(/(?:证书号|海关编码)?\s*([A-Z0-9]{6,}(?:\s*[、,，]\s*[A-Z0-9]{6,})*)/);
  const dateM = meta.match(/((?:20\d{2}[-年]\d{1,2}[-月]\d{0,2}日?[^，,]*)?(?:有效期至|发证|记录|认定|备案)\s*20\d{2}[-年]\d{1,2}[-月]?\d{0,2}日?|20\d{2} 年|20\d{2}年)/);
  const anyD = meta.match(/20\d{2}[-年]\d{1,2}[-月]\d{0,2}日?/);
  return { name, no: noM ? noM[1] : "", date: dateM ? dateM[1] : (anyD ? anyD[0] : (meta.length <= 22 ? meta : "")) };
}
const GROUPS: [string, RegExp][] = [
  ["体系与管理认证", /ISO|管理体系/],
  ["产品认证与国际验厂", /TUV|TUV|BSCI|验厂|产品认证/],
  ["企业荣誉与资质认定", /科技型|专精特新|技术中心|高新技术|规上/],
  ["信用、备案与其他在册许可", /信用|海关|对外贸易|备案/],
];
const grouped: { g: string; rows: { name: string; no: string; date: string }[] }[] = GROUPS.map(([g]) => ({ g, rows: [] }));
const others: { name: string; no: string; date: string }[] = [];
for (const c of certs) {
  const p = parseCert(c);
  const gi = GROUPS.findIndex(([, re]) => re.test(c));
  if (gi >= 0) grouped[gi].rows.push(p); else others.push(p);
}
if (others.length) grouped.find(g => g.g.startsWith("信用"))!.rows.push(...others);

doc.addPage();
pageTitle("Certifications & Audits", "资质证书与验厂记录", `公开渠道在册 ${certs.length} 项 · 已按类别重排并对齐编号与有效期 · 可向发证机构逐项核验`);
for (const { g, rows } of grouped) {
  if (!rows.length) continue;
  needSpace(34 + rows.length * 20);
  h2(g);
  if (g === grouped.find(x => x.rows.length)!.g) {
    // 表头只渲染一次（首个非空组）
    const y0 = doc.y;
    doc.font("b").fontSize(8).fillColor(INK40).text("证书名称", 58, y0, { lineBreak: false });
    doc.text("证书编号 / 认定号", 268, y0, { lineBreak: false });
    doc.text("日期 / 有效期", 418, y0, { lineBreak: false });
    doc.y = y0 + 12;
    doc.moveTo(48, doc.y).lineTo(48 + PW, doc.y).lineWidth(0.75).strokeColor(LINE).stroke();
    doc.y += 4;
  }
  rows.forEach((r, i) => {
    const rh = Math.max(
      doc.font("b").fontSize(9).heightOfString(r.name, { width: 200 }),
      doc.font("r").fontSize(8.5).heightOfString(r.no || "—", { width: 140 }),
      doc.font("r").fontSize(8.5).heightOfString(r.date || "以证书原件为准", { width: 120 }),
    ) + 6;
    needSpace(rh + 4);
    const y = doc.y;
    if (i % 2 === 0) doc.rect(48, y - 2, PW, rh).fill("#f7f9fc");
    doc.font("b").fontSize(9).fillColor(INK).text(r.name, 58, y + 2, { width: 200 });
    doc.font("r").fontSize(8.5).fillColor(INK60).text(r.no || "—", 268, y + 2.5, { width: 140 });
    doc.font("r").fontSize(8.5).fillColor(INK60).text(r.date || "以证书原件为准", 418, y + 2.5, { width: 120 });
    doc.y = y + rh;
  });
  doc.moveDown(0.3);
}
noteBox("以上为公开渠道在册记录〔官方公示〕；证书真伪与有效性可在下单前由我方协助向发证机构逐项复核。标「以证书原件为准」的条目表示公开信息不完整，已如实标注、未做推测。", "#1f4e9c", "#eef4fd");

// ═══ 出口与市场 ═══
doc.addPage();
pageTitle("Export & Markets", "出口与市场");
if (st.main_market) { h2("主营市场"); para(String(st.main_market), 9.5, INK60, 0.4, "公开报道"); }
h2("出口客户记录（历史）");
para("公开资料载明该企业历史供货 Lidl、Aldi、Argos 等国际零售与运动品牌。以上为历史合作记录，不代表当前合作状态，亦不构成对该企业的背书。", 9.5, INK60, 0.4, "公开报道");
h2("备案记录");
kvRow("海关备案", "进出口货物收发货人（2013 年备案，状态正常）", false, "官方公示");
kvRow("外贸备案", "对外贸易经营者备案登记", true, "官方公示");

// ═══ 核查边界 + 可触达性（降权平实，承接证书页留白）═══
needSpace(150);
doc.moveDown(0.8);
pageTitle("Scope & Limits", "核查边界", "以下为远程核查无法覆盖项，我们不猜测、不编造，显式列出");
for (const [k, v] of [
  ["现场生产条件", "实际产线数量、在制品、仓储与现场管理水平 —— 可升级实地验厂覆盖。"],
  ["银行资信", "开户行资信证明、授信额度 —— 需委托后由我方按规核验。"],
  ["海关数据明细", "逐票进出口记录、真实出口额 —— 公开渠道无法获取。"],
  ["涉诉与被执行", "以司法数据库正式核验为准；本次公开渠道初筛未见重大异常。"],
] as [string, string][]) {
  needSpace(40);
  const y = doc.y;
  doc.roundedRect(48, y, PW, 34, 6).lineWidth(1).strokeColor(LINE).stroke();
  doc.font("b").fontSize(9.5).fillColor(INK).text(k, 60, y + 6, { width: 100 });
  doc.font("r").fontSize(8.5).fillColor(INK60).text(v, 168, y + 6.5, { width: PW - 140, lineGap: 2 });
  doc.y = y + 42;
}
doc.moveDown(0.4);
para("以上缺口可通过「升级实地验厂」与「委托采购后核验」覆盖：我方验厂员上门核产线、核库存、核管理，出具图文验厂报告；司法与资信由专属团队在委托后完成数据库核验。", 9, INK40);

doc.moveDown(0.8);
doc.font("b").fontSize(8).fillColor(BRAND).text("R E A C H A B I L I T Y", 48, doc.y, { width: PW, characterSpacing: 1 });
doc.moveDown(0.15);
doc.font("b").fontSize(16).fillColor(INK).text("可触达性", 48, doc.y, { width: PW });
doc.moveDown(0.5);
para(`已确认该企业存在公开联系电话 ${item.phones_count ?? 0} 条、决策层关联人 ${item.decision_maker_count ?? 0} 条、企业官网等渠道。出于信息安全与合规要求，本报告不展示具体号码与账号——委托采购后由我方团队代为对接，买家无需自行联系。`, 9.5, INK60, 0.4);
if (st.official_site) para(`企业官网：${st.official_site}`, 9, INK60, 0.4, "官方公示");

// ═══ 来源附录（类别 + 可信度分级图例）═══
const SRC_GROUPS: [RegExp, string][] = [
  [/qcc\.com|qixin\.com|tianyancha|qizhidao|7icp|ccpc360/i, "企业信用信息平台（工商底档 · 商标专利 · 经营记录）"],
  [/zhaopin|zhipin/i, "招聘平台公开页（在招岗位与规模印证）"],
  [/thepaper|gov\.cn/i, "新闻与政务公开（项目备案 · 公示信息）"],
  [/cantonfair|trustsailing/i, "广交会参展商公开名录"],
  [/js-baoxiang/i, "企业官网"],
];
const srcCount = new Map<string, number>();
for (const s of (dd.sources ?? []) as string[]) {
  if (/taobao|tmall/i.test(s)) continue; // 上游平台来源不进附录（1688/天下工厂已被 clean 剥离）
  const g = SRC_GROUPS.find(([re]) => re.test(s));
  const label = g ? g[1] : "其他公开渠道";
  srcCount.set(label, (srcCount.get(label) ?? 0) + 1);
}
needSpace(240);
doc.moveDown(0.8);
pageTitle("Sources", "来源附录", "本报告信息来自以下类别的公开渠道（截至 2026-11-17），多源交叉印证后成稿");
{
  let i = 1;
  for (const [label, n] of srcCount) {
    const y = doc.y;
    doc.font("b").fontSize(9.5).fillColor(BRAND).text(`[${i}]`, 48, y, { lineBreak: false });
    doc.font("r").fontSize(9.5).fillColor(INK).text(label, 76, y, { width: PW - 100 });
    doc.font("r").fontSize(9.5).fillColor(INK40).text(`${n} 条`, 76, y, { width: PW - 36, align: "right" });
    doc.y = y + 20;
    i++;
  }
}
doc.moveDown(0.8);
h2("来源可信度分级（本报告标注规则）");
for (const [tag, desc, color] of [
  ["官方公示", "工商、认证、海关、政务等官方记录 —— 事实性最强", "#1f6fb2"],
  ["司法公示", "裁判文书、执行信息、行政处罚 —— 事实性最强（本次未取得完整覆盖）", "#5b3fa8"],
  ["公开报道", "媒体、行业名录、展会名录 —— 需注明时间与出处", "#92610a"],
  ["企业自述", "企业官网、宣传材料、招聘自填 —— 仅供参考，不作履约证明", "#6b7688"],
] as [string, string, string][]) {
  const y = doc.y;
  doc.roundedRect(48, y, 62, 16, 8).fill("#f2f7fd");
  doc.font("b").fontSize(8).fillColor(color).text(tag, 48, y + 4, { width: 62, align: "center" });
  doc.font("r").fontSize(8.5).fillColor(INK60).text(desc, 120, y + 4, { width: PW - 80 });
  doc.y = y + 22;
}
doc.moveDown(0.6);
para(`说明：共引用公开来源 ${[...srcCount.values()].reduce((a, b) => a + b, 0)} 条，逐条原始链接随报告数据存档，可凭报告编号向我方索取核对。为保护我方采购渠道，供应链上游平台来源不在本报告中列示。`, 8.5, INK40);

// ═══ 收口页：三出口 ═══
doc.addPage();
doc.rect(0, 0, 595.28, 120).fill(NAVY);
doc.font("b").fontSize(18).fillColor("#ffffff").text("下一步怎么走", 48, 42);
doc.font("r").fontSize(9.5).fillColor("rgba(255,255,255,0.7)").text("核查到此为止，成交交给 SourcBuy —— 我们只代表买方", 48, 70);
doc.y = 152;
const cta: [string, string, string, boolean][] = [
  ["A", "委托 SourcBuy 向该厂采购", "由我们代谈价、代验货、代跟单：双检出货 + 分段付款 + 先行赔付（单笔最高 $50,000）。您只需确认报价与收货。", true],
  ["B", "对比同品类已验厂供应商", "我们的严选库里有同品类已完成核验的工厂，可比价、比产能、比交期，不必从零开始。", false],
  ["C", "升级实地验厂", "对这家厂有兴趣但心里没底？验厂员上门：核产线、核库存、核管理，出具图文验厂报告后再决定。", false],
];
for (const [tag, title, body, hot] of cta) {
  needSpace(110);
  const y = doc.y;
  doc.roundedRect(48, y, PW, 96, 8).lineWidth(hot ? 1.5 : 1).strokeColor(hot ? BRAND : LINE).stroke();
  if (hot) {
    doc.roundedRect(48 + PW - 52, y + 12, 40, 16, 8).fill(BRAND);
    doc.font("b").fontSize(8).fillColor("#ffffff").text("推荐", 48 + PW - 52, y + 16, { width: 40, align: "center" });
  }
  doc.circle(72, y + 30, 13).fill(BRAND);
  doc.font("b").fontSize(13).fillColor("#ffffff").text(tag, 66.5, y + 21, { lineBreak: false });
  doc.font("b").fontSize(12).fillColor(INK).text(title, 96, y + 18, { width: PW - 180 });
  doc.font("r").fontSize(9).fillColor(INK60).text(body, 96, y + 42, { width: PW - 130, lineGap: 3.5 });
  doc.y = y + 110;
}
doc.moveDown(0.4);
doc.font("r").fontSize(9).fillColor(INK40).text(`报告编号 ${RID} · 验真入口 sourcbuyai.com（输入编号即可核对原件）`, 48, doc.y, { width: PW, align: "center" });

// ═══ 页眉页脚（补绘；临时放开 margin 防自动分页）═══
const range = doc.bufferedPageRange();
for (let i = 0; i < range.count; i++) {
  doc.switchToPage(i);
  const savedBottom = doc.page.margins.bottom;
  const savedTop = doc.page.margins.top;
  doc.page.margins.bottom = 0;
  doc.page.margins.top = 0;
  if (i > 0) {
    doc.font("r").fontSize(7.5).fillColor(INK40).text("SourcBuy 供应商核查报告", 48, 28, { lineBreak: false });
    doc.text(RID, 48, 28, { align: "right" });
    doc.moveTo(48, 42).lineTo(547.28, 42).lineWidth(0.5).strokeColor(LINE).stroke();
  }
  doc.font("r").fontSize(7.5).fillColor(INK40).text(`第 ${i + 1} / ${range.count} 页 · 本报告基于公开资料初步核查，不构成担保`, 48, 806, { align: "center", lineBreak: false });
  doc.page.margins.bottom = savedBottom;
  doc.page.margins.top = savedTop;
}

doc.end();
stream.on("finish", () => console.log("OK", OUT));
