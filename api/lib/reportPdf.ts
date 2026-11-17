// ═══ P4 核查报告 PDF 渲染器（样张版式参数化：v3.1 视觉口径）═══
// 输入 = ReportSnapshot（在线页共用同一份快照）+ locale（六语言标签字典）。
// 部署纪律：字体走项目 assets（api/assets/fonts，构建拷入 dist/assets），绝不依赖系统字体路径。
// 格鲁吉亚语：Georgian 字体无 CJK 字形——按文本是否含中文动态选字体（厂名等中文残留不豆腐）。
import PDFDocument from "pdfkit";
import * as fs from "fs";
import * as path from "path";
import type { ReportSnapshot, SrcTag } from "../queries/verification";
import { reportDict, type ReportLocale } from "./reportI18n";

// ─── 字体定位：候选路径找第一个存在的（开发=app 根，部署=dist 根）───
function fontDir(): string {
  for (const p of ["api/assets/fonts", "assets/fonts", "../api/assets/fonts", "/mnt/agents/output/app/api/assets/fonts"]) {
    if (fs.existsSync(path.join(process.cwd(), p, "NotoSansCJK-Regular.ttc"))) return path.join(process.cwd(), p);
    if (fs.existsSync(path.resolve(p, "NotoSansCJK-Regular.ttc"))) return path.resolve(p);
  }
  return "/usr/share/fonts/opentype/noto"; // 最后兜底（样张脚本路径）
}

const NAVY = "#12233c", BRAND = "#2f9df0";
const INK = "#1a2332", INK60 = "#5a6675", INK40 = "#8b94a3", LINE = "#e3e8ef";
const AMBER = "#92610a", AMBER_BG = "#fdf6e3";
const GRAY = "#6b7688";
const SRC_COLOR: Record<SrcTag, string> = { 官方公示: "#1f6fb2", 司法公示: "#5b3fa8", 公开报道: "#92610a", 企业自述: "#6b7688" };

export async function renderReportPdf(snap: ReportSnapshot, locale: string): Promise<string> {
  const loc = (locale in { zh: 1, en: 1, es: 1, fr: 1, pt: 1, ka: 1 } ? locale : "zh") as ReportLocale;
  const T = reportDict(loc);
  const dir = fontDir();
  const doc = new PDFDocument({ size: "A4", margins: { top: 64, bottom: 64, left: 48, right: 48 }, bufferPages: true, info: { Title: `SourcBuy ${T.reportTitle} ${snap.meta.reportNo}`, Author: "SourcBuy" } });
  doc.registerFont("r", path.join(dir, "NotoSansCJK-Regular.ttc"), "NotoSansCJKsc-Regular");
  doc.registerFont("b", path.join(dir, "NotoSansCJK-Bold.ttc"), "NotoSansCJKsc-Bold");
  if (loc === "ka" && fs.existsSync(path.join(dir, "NotoSansGeorgian-Regular.ttf"))) {
    doc.registerFont("gr", path.join(dir, "NotoSansGeorgian-Regular.ttf"));
    doc.registerFont("gb", path.join(dir, "NotoSansGeorgian-Bold.ttf"));
  }
  // ka 动态选字体：含中文→CJK，否则→Georgian；其他语言一律 CJK 字体（拉丁字形已验证）
  const F = (text: string, bold: boolean) => (loc === "ka" && !/[一-鿿]/.test(text) ? (bold ? "gb" : "gr") : bold ? "b" : "r");
  const SRC_LABEL: Record<SrcTag, string> = { 官方公示: T.srcOfficial, 司法公示: T.srcJudicial, 公开报道: T.srcPress, 企业自述: T.srcSelf };

  const outDir = path.join(process.cwd(), "uploads", "reports");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${snap.meta.reportNo}.pdf`);
  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);

  const PW = 595.28 - 96;

  // ─── 版式助手（样张 v3.1 同构）───
  const srcTag = (x: number, y: number, t: SrcTag) => {
    const label = `〔${SRC_LABEL[t]}〕`;
    doc.font(F(label, false)).fontSize(7.5).fillColor(SRC_COLOR[t]);
    doc.text(label, x - doc.widthOfString(label), y + 1.5, { lineBreak: false });
  };
  const para = (t: string, size = 9.5, color = INK60, gap = 0.4, tag?: SrcTag) => {
    const y = doc.y, w = tag ? PW - 70 : PW;
    doc.font(F(t, false)).fontSize(size);
    const th = doc.heightOfString(t, { width: w, lineGap: 3.5 });
    doc.fillColor(color).text(t, 48, y, { width: w, lineGap: 3.5 });
    if (tag) srcTag(48 + PW, y, tag);
    doc.y = y + th + gap * 12;
  };
  const needSpace = (h: number) => { if (doc.y + h > 780) doc.addPage(); };
  const h2 = (t: string) => {
    doc.moveDown(0.6);
    const y0 = doc.y;
    doc.font(F(t, true)).fontSize(13).fillColor(INK);
    const th = doc.heightOfString(t, { width: PW });
    doc.text(t, 48, y0, { width: PW });
    const y = y0 + th + 2;
    doc.moveTo(48, y).lineTo(48 + 36, y).lineWidth(2.5).strokeColor(BRAND).stroke();
    doc.y = y + 8;
  };
  const noteBox = (text: string, fg = AMBER, bg = "#fbf7ec") => {
    doc.font(F(text, false)).fontSize(8.5);
    const h = doc.heightOfString(text, { width: PW - 20, lineGap: 3 }) + 18;
    if (doc.y + h + 10 > 770) doc.addPage(); // 先换页再取 y，杜绝幽灵空页
    const y = doc.y + 2;
    doc.roundedRect(48, y, PW, h, 6).fill(bg);
    doc.fillColor(fg).text(text, 58, y + 9, { width: PW - 20, lineGap: 3 });
    doc.y = y + h + 8;
  };
  const pageTitle = (eyebrow: string, t: string, sub?: string) => {
    doc.font("b").fontSize(8).fillColor(BRAND).text(eyebrow.split("").join(" "), 48, doc.y, { width: PW, characterSpacing: 1 });
    doc.moveDown(0.15);
    doc.font(F(t, true)).fontSize(16).fillColor(INK).text(t, 48, doc.y, { width: PW });
    if (sub) { doc.moveDown(0.25); doc.font(F(sub, false)).fontSize(9).fillColor(INK40).text(sub, 48, doc.y, { width: PW }); }
    doc.moveDown(0.8);
  };
  // 两列网格卡（工商底档用）
  const gridCards = (items: { label: string; value: string; source?: SrcTag }[]) => {
    const CW = (PW - 12) / 2;
    items.forEach((it, i) => {
      const col = i % 2;
      if (col === 0) needSpace(56);
      const x = 48 + col * (CW + 12), y = doc.y;
      doc.roundedRect(x, y, CW, 50, 6).fill("#f7f9fc");
      doc.font(F(it.label, false)).fontSize(7.5).fillColor(INK40).text(it.label, x + 10, y + 8, { width: CW - (it.source ? 84 : 20) });
      doc.font(F(it.value, true)).fontSize(9.5).fillColor(INK).text(it.value, x + 10, y + 22, { width: CW - 20, lineBreak: false });
      if (it.source) srcTag(x + CW - 8, y + 8, it.source);
      if (col === 1 || i === items.length - 1) doc.y = y + 56;
    });
  };

  // ═══ 封面 + 首屏决策卡 ═══
  doc.rect(0, 0, 595.28, 292).fill(NAVY);
  doc.font("b").fontSize(15).fillColor("#ffffff").text("SourcBuy", 48, 50);
  doc.font(F(T.brandLine, false)).fontSize(8.5).fillColor("rgba(255,255,255,0.65)").text(T.brandLine, 48, 72);
  doc.font(F(T.reportTitle, true)).fontSize(24).fillColor("#ffffff").text(T.reportTitle, 48, 100, { width: 340 });
  doc.font(F(T.reportSubtitle, false)).fontSize(9.5).fillColor("rgba(255,255,255,0.72)").text(`Supplier Verification Report · ${T.reportSubtitle}`, 48, 132, { width: 340 });
  doc.font(F(snap.meta.companyName, true)).fontSize(16).fillColor("#ffffff").text(snap.meta.companyName, 48, 168, { width: 340 });
  doc.font(F(T.usccLabel, false)).fontSize(9).fillColor("rgba(255,255,255,0.65)").text(`${T.usccLabel}：${snap.meta.uscc ?? "—"}`, 48, 194, { width: 340 });
  doc.font(F(T.coverNote, false)).fontSize(8).fillColor("rgba(255,255,255,0.6)").text(T.coverNote, 48, 226, { width: 340 });
  doc.font("r").fontSize(8).fillColor("rgba(255,255,255,0.6)").text(T.coverMeta(snap.meta.reportNo, snap.meta.date), 48, 242, { width: 340 });
  // 右侧核查印章
  {
    const cx = 462, cy = 128;
    doc.circle(cx, cy, 62).lineWidth(1).strokeColor("rgba(255,255,255,0.35)").stroke();
    const label = "SOURCBUY VERIFICATION · REMOTE SCREENING · ";
    doc.font("b").fontSize(6.5);
    for (let i = 0; i < label.length; i++) {
      const a = (i / label.length) * 360 - 90, rad = (a * Math.PI) / 180;
      const x = cx + 52 * Math.cos(rad), y = cy + 52 * Math.sin(rad);
      doc.save();
      doc.rotate(a + 90, { origin: [x, y] });
      doc.fillColor("rgba(255,255,255,0.55)").text(label[i], x - doc.widthOfString(label[i]) / 2, y - 4.5, { lineBreak: false });
      doc.restore();
    }
    doc.circle(cx, cy, 38).lineWidth(1.5).strokeColor(BRAND).stroke();
    doc.path(`M ${cx - 13} ${cy + 1} L ${cx - 3} ${cy + 11} L ${cx + 15} ${cy - 11}`).lineWidth(4).lineCap("round").strokeColor("#ffffff").stroke();
    doc.font(F(T.sealText, true)).fontSize(8).fillColor("rgba(255,255,255,0.85)").text(T.sealText, cx - 70, cy + 74, { width: 120, align: "center" });
  }
  // 决策卡（白卡压封底边缘；三指标与风险条间距已按 v3.1 修复）
  const CY = 276;
  doc.roundedRect(48, CY, PW, 184, 10).fill("#ffffff").lineWidth(1).strokeColor(LINE).stroke();
  doc.font(F(T.decisionTitle, false)).fontSize(8.5).fillColor(INK40).text(T.decisionTitle, 66, CY + 16);
  const concl = T.conclusion(snap.conclusion.pending, snap.conclusion.uncovered);
  doc.font(F(concl, true)).fontSize(13.5).fillColor(INK).text(concl, 66, CY + 32, { width: PW - 32 });
  doc.font(F(snap.conclusion.summary, false)).fontSize(9.5).fillColor(INK60).text(snap.conclusion.summary, 66, CY + 56, { width: PW - 32, lineGap: 3 });
  if (snap.inOurSystem) {
    doc.roundedRect(66, CY + 74, doc.widthOfString(T.inOurSystem) + 20, 16, 8).fill("#e7f6ec");
    doc.font(F(T.inOurSystem, true)).fontSize(8).fillColor("#0a7a30").text(T.inOurSystem, 76, CY + 78, { lineBreak: false });
  }
  const my = CY + 96;
  doc.moveTo(66, my).lineTo(48 + PW - 18, my).lineWidth(0.75).strokeColor(LINE).stroke();
  {
    let x = 66;
    const metrics: [string, string][] = [
      [T.metricYears, snap.metrics.years != null ? `${snap.metrics.years}${T.yearSuffix}` : "—"],
      [T.metricCerts, `${snap.metrics.certs}${T.certSuffix}`],
      [T.metricCoverage, `${snap.metrics.coverageDone} / ${snap.metrics.coverageTotal}`],
    ];
    for (const [k, v] of metrics) {
      doc.font(F(k, false)).fontSize(8).fillColor(INK40).text(k, x, my + 10, { lineBreak: false });
      doc.font("b").fontSize(15).fillColor(BRAND).text(v, x, my + 24, { lineBreak: false });
      x += 160;
    }
  }
  const ry = CY + 140;
  doc.roundedRect(58, ry, PW - 20, 26, 5).fill(AMBER_BG);
  doc.font(F(snap.maxRisk, false)).fontSize(8.5).fillColor(AMBER).text(`${T.maxRisk}：${snap.maxRisk}`, 68, ry + 7.5, { width: PW - 40 });
  doc.y = CY + 200;
  // 四事实卡
  {
    const fy2 = doc.y + 4;
    const facts: [string, string][] = [
      [T.factEstablish, snap.facts.establishDate ?? "—"],
      [T.factCapital, snap.facts.regCapital ?? "—"],
      [T.factStatus, snap.facts.status ?? "—"],
      [T.factTrade, snap.facts.foreignTrade],
    ];
    let fx = 48;
    for (const [k, v] of facts) {
      doc.roundedRect(fx, fy2, 116, 54, 6).fill("#f2f7fd");
      doc.font(F(k, false)).fontSize(7.5).fillColor(INK40).text(k, fx + 10, fy2 + 8, { width: 100 });
      doc.font(F(v, true)).fontSize(10.5).fillColor(INK).text(v, fx + 10, fy2 + 24, { width: 100 });
      fx += 124;
    }
    doc.y = fy2 + 66;
  }
  noteBox(T.disclaimer);
  // 报告内容导览
  {
    doc.moveDown(0.4);
    const y0 = doc.y;
    doc.font(F(T.tocTitle, true)).fontSize(9).fillColor(INK40).text(T.tocTitle, 48, y0, { lineBreak: false });
    T.toc.forEach((t, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const x = 48 + col * 250, y = y0 + 20 + row * 24;
      doc.font("b").fontSize(9).fillColor(BRAND).text(`0${i + 1}`, x, y, { lineBreak: false });
      doc.font(F(t, false)).fontSize(9).fillColor(INK60).text(t, x + 24, y, { width: 220, lineBreak: false });
    });
    doc.y = y0 + 20 + 3 * 24 + 6;
  }

  // ═══ 核验矩阵 ═══
  doc.addPage();
  pageTitle(T.matrixEyebrow, T.matrixTitle, `${T.matrixSub} · ${snap.meta.date}`);
  noteBox(T.attNote);
  const order = { pending: 0, uncovered: 1, verified: 2 } as const;
  for (const m of [...snap.matrix].sort((a, b) => order[a.status] - order[b.status])) {
    needSpace(34);
    const y = doc.y;
    const chip = m.status === "verified" ? { t: `✓ ${T.stVerified}`, fg: "#0a7a30", bg: "#e7f6ec" }
      : m.status === "pending" ? { t: `⚠ ${T.stPending}`, fg: AMBER, bg: AMBER_BG }
      : { t: `○ ${T.stUncovered}`, fg: GRAY, bg: "#eef1f5" };
    doc.roundedRect(48, y, 66, 22, 5).fill(chip.bg);
    doc.font(F(chip.t, true)).fontSize(8).fillColor(chip.fg).text(chip.t, 48, y + 6.5, { width: 66, align: "center", lineBreak: false });
    doc.font(F(m.item, true)).fontSize(9.5).fillColor(INK).text(m.item, 124, y + 1, { width: 130 });
    doc.font(F(m.detail, false)).fontSize(8.5);
    const dw = PW - 216;
    const dh = doc.heightOfString(m.detail, { width: dw, lineGap: 3 });
    doc.fillColor(INK60).text(m.detail, 264, y, { width: dw, lineGap: 3 });
    srcTag(48 + PW, y, m.source);
    doc.y = y + Math.max(24, dh + 6) + 2;
  }
  noteBox(T.noNegative, "#0a7a30", "#f0f9f2");

  // ═══ 工商底档 ═══
  doc.addPage();
  pageTitle("REGISTRATION PROFILE", T.regTitle, T.regSub);
  gridCards(snap.registration);
  if (snap.mainProducts) { h2(T.secMainProducts); para(snap.mainProducts, 9.5, INK, 0.4, "官方公示"); }
  if (snap.businessScope) { h2(T.secBusinessScope); para(snap.businessScope.slice(0, 600), 8.5, INK60, 0.4, "官方公示"); }
  if (snap.intro) { h2(T.secIntro); para(snap.intro.slice(0, 800), 9, INK60, 0.4, "企业自述"); }

  // ═══ 经营与产能 ═══
  doc.addPage();
  pageTitle("OPERATIONS & CAPACITY", T.capTitle);
  for (const p of snap.capacity.paragraphs) para(p.text, 9.5, INK60, 0.5, p.source);
  for (const c of snap.capacity.conflicts) noteBox(c);
  if (snap.capacity.equipment.length) { h2(T.secEquipment); para(snap.capacity.equipment.join("、"), 9, INK60, 0.4, "企业自述"); }
  if (snap.capacity.productLines.length) {
    h2(T.secProductLines);
    for (const p of snap.capacity.productLines) {
      needSpace(24);
      const y = doc.y;
      doc.font(F(p.name, true)).fontSize(9).fillColor(INK).text(`· ${p.name}`, 56, y, { width: PW - 16 });
      doc.y = y + 14;
      if (p.specs) { doc.font(F(p.specs, false)).fontSize(8).fillColor(INK60).text(p.specs, 66, doc.y, { width: PW - 26 }); }
      doc.moveDown(0.25);
    }
  }

  // ═══ 资质证书 ═══
  doc.addPage();
  pageTitle("CERTIFICATIONS & AUDITS", T.certTitle);
  for (const g of snap.certs) {
    needSpace(60);
    h2(g.group);
    let header = false;
    for (const it of g.items) {
      needSpace(22);
      const y = doc.y;
      if (!header) {
        doc.font("r").fontSize(7.5).fillColor(INK40).text(T.certColName, 56, y, { lineBreak: false });
        doc.text(T.certColNo, 300, y, { lineBreak: false });
        doc.y = y + 12;
        header = true;
      }
      const yy = doc.y;
      doc.font(F(it.name, false)).fontSize(9);
      const nh = doc.heightOfString(it.name, { width: 236, lineGap: 2 });
      doc.fillColor(INK).text(it.name, 56, yy, { width: 236, lineGap: 2 });
      const noText = it.no ?? T.certAsOriginal;
      doc.font(F(noText, false)).fontSize(8.5);
      const vh = doc.heightOfString(noText, { width: 240, lineGap: 2 });
      doc.fillColor(INK60).text(noText, 300, yy + 1, { width: 240, lineGap: 2 });
      doc.y = yy + Math.max(16, Math.max(nh, vh) + 6); // 两列取高者推进，防编号列换行重叠
    }
  }
  noteBox(T.certNote);

  // ═══ 出口与市场 + 边界 + 可触达性 ═══
  doc.addPage();
  pageTitle("EXPORT & MARKETS", T.expTitle);
  if (snap.exportMarket.markets) { h2(T.secMarkets); para(snap.exportMarket.markets, 9.5, INK60, 0.4, "公开报道"); }
  if (snap.exportMarket.customs) { h2(T.secCustoms); para(snap.exportMarket.customs, 9.5, INK, 0.4, "官方公示"); }
  if (snap.wbCross) {
    h2(T.secWbCross);
    para(T.wbCrossPara(snap.wbCross.years, snap.wbCross.category, snap.wbCross.area), 9.5, INK60, 0.4, "公开报道");
  }
  if (snap.priceIntel) {
    h2(T.secPrice(snap.priceIntel.word));
    para(T.pricePara(snap.priceIntel.count, snap.priceIntel.min.toFixed(2), snap.priceIntel.max.toFixed(2), snap.meta.date), 9.5, INK60, 0.4, "公开报道");
  }
  h2(T.secBoundary);
  para(T.secBoundaryIntro, 9, INK40, 0.3);
  for (const b of snap.boundaries) {
    needSpace(30);
    const y = doc.y;
    doc.roundedRect(48, y, PW, 26, 5).fill("#f7f9fc");
    doc.font(F(b.item, true)).fontSize(8.5).fillColor(INK).text(b.item, 60, y + 7, { width: 120, lineBreak: false });
    doc.font(F(b.note, false)).fontSize(8).fillColor(INK60).text(b.note, 190, y + 7.5, { width: PW - 152, lineBreak: false });
    doc.y = y + 32;
  }
  h2(T.secReach);
  para(T.reachPara(snap.reachability.phoneCount, snap.reachability.dmCount, snap.reachability.website), 9, INK60, 0.4);
  if (snap.priceIntel?.samples.length) {
    h2(T.secPoolRef);
    for (const s of snap.priceIntel.samples) {
      needSpace(20);
      const y = doc.y;
      doc.font(F(s.title, false)).fontSize(8.5).fillColor(INK60).text(`· ${s.title}`, 56, y, { width: PW - 120, lineBreak: false });
      doc.font("b").fontSize(8.5).fillColor(BRAND).text(`¥${s.price.toFixed(2)}`, 48 + PW - 90, y, { lineBreak: false });
      doc.y = y + 15;
    }
  }

  // ═══ 来源附录 ═══
  doc.addPage();
  pageTitle("SOURCES", T.srcTitle, T.srcSub(snap.meta.date));
  {
    const CW = (PW - 12) / 2;
    snap.sources.forEach((s, i) => {
      const col = i % 2;
      if (col === 0) needSpace(52);
      const x = 48 + col * (CW + 12), y = doc.y;
      doc.roundedRect(x, y, CW, 46, 6).fill("#f7f9fc");
      doc.font("b").fontSize(9).fillColor(BRAND).text(`[${i + 1}]`, x + 10, y + 8, { lineBreak: false });
      doc.font("b").fontSize(13).fillColor(INK).text(`${s.count}${T.srcCountSuffix}`, x + CW - 58, y + 8, { width: 48, align: "right", lineBreak: false });
      doc.font(F(s.category, false)).fontSize(7.5).fillColor(INK60).text(s.category, x + 10, y + 26, { width: CW - 20 });
      if (col === 1 || i === snap.sources.length - 1) doc.y = y + 52;
    });
  }
  h2(T.credTitle);
  {
    const CW = (PW - 12) / 2;
    const legends: [SrcTag, string][] = [
      ["官方公示", T.legendDescOfficial],
      ["司法公示", T.legendDescJudicial],
      ["公开报道", T.legendDescPress],
      ["企业自述", T.legendDescSelf],
    ];
    legends.forEach(([tag, desc], i) => {
      const col = i % 2;
      if (col === 0) needSpace(54);
      const x = 48 + col * (CW + 12), y = doc.y;
      doc.roundedRect(x, y, CW, 48, 6).fill("#ffffff").lineWidth(1).strokeColor(LINE).stroke();
      srcTag(x + 10 + doc.widthOfString(`〔${SRC_LABEL[tag]}〕`), y + 8, tag);
      doc.font(F(desc, false)).fontSize(7.5).fillColor(INK60).text(desc, x + 10, y + 24, { width: CW - 20 });
      if (col === 1 || i === legends.length - 1) doc.y = y + 54;
    });
  }
  h2(T.methodTitle);
  {
    const CW = (PW - 24) / 3;
    needSpace(64);
    const y0 = doc.y;
    T.methods.forEach(([t, d], i) => {
      const x = 48 + i * (CW + 12);
      doc.roundedRect(x, y0, CW, 58, 6).fill("#f2f7fd");
      doc.font(F(t, true)).fontSize(8.5).fillColor(INK).text(t, x + 10, y0 + 8, { width: CW - 20 });
      doc.font(F(d, false)).fontSize(7).fillColor(INK60).text(d, x + 10, y0 + 24, { width: CW - 20, lineGap: 2 });
    });
    doc.y = y0 + 66;
  }
  noteBox(T.srcAsk(snap.meta.reportNo), "#1f6fb2", "#eef6fd");

  // ═══ 收口页：三出口 ═══
  doc.addPage();
  doc.rect(0, 0, 595.28, 150).fill(NAVY);
  doc.font("b").fontSize(8).fillColor("rgba(255,255,255,0.55)").text("N E X T   S T E P", 48, 40, { lineBreak: false, characterSpacing: 1 });
  doc.font(F(T.ctaTitle, true)).fontSize(20).fillColor("#ffffff").text(T.ctaTitle, 48, 58, { width: PW });
  doc.font(F(T.ctaSub, false)).fontSize(9.5).fillColor("rgba(255,255,255,0.72)").text(T.ctaSub, 48, 94, { width: 420 });
  {
    const cx = 502, cy = 76;
    doc.circle(cx, cy, 30).lineWidth(1.2).strokeColor("rgba(255,255,255,0.45)").stroke();
    doc.path(`M ${cx - 10} ${cy + 1} L ${cx - 2} ${cy + 9} L ${cx + 12} ${cy - 9}`).lineWidth(3).lineCap("round").strokeColor(BRAND).stroke();
  }
  doc.y = 176;
  const cta: [string, string, string, boolean][] = [["A", T.ctaA, T.ctaADesc, true], ["B", T.ctaB, T.ctaBDesc, false], ["C", T.ctaC, T.ctaCDesc, false]];
  for (const [tag, title, body, hot] of cta) {
    needSpace(122);
    const y = doc.y;
    doc.roundedRect(50.5, y + 3, PW, 108, 8).fill(hot ? "rgba(18,35,60,0.28)" : "rgba(26,35,50,0.08)");
    if (hot) {
      doc.roundedRect(48, y, PW, 108, 8).fill(NAVY);
      doc.roundedRect(48 + PW - 60, y + 14, 48, 19, 9.5).fill("#f0b429");
      doc.font(F(T.recommended, true)).fontSize(8.5).fillColor(NAVY).text(T.recommended, 48 + PW - 60, y + 19, { width: 48, align: "center" });
      doc.circle(76, y + 42, 16).fill("#ffffff");
      doc.font("b").fontSize(14).fillColor(NAVY).text(tag, 70, y + 32.5, { width: 12, align: "center", lineBreak: false });
      doc.font(F(title, true)).fontSize(12.5).fillColor("#ffffff").text(title, 106, y + 26, { width: PW - 200 });
      doc.font(F(body, false)).fontSize(9).fillColor("rgba(255,255,255,0.85)").text(body, 106, y + 50, { width: PW - 146, lineGap: 3.5 });
    } else {
      doc.roundedRect(48, y, PW, 108, 8).fill("#ffffff").lineWidth(1).strokeColor(LINE).stroke();
      doc.rect(48, y + 12, 3.5, 84).fill(tag === "B" ? BRAND : INK40);
      doc.circle(76, y + 42, 16).fill(tag === "B" ? BRAND : GRAY);
      doc.font("b").fontSize(14).fillColor("#ffffff").text(tag, 70, y + 32.5, { width: 12, align: "center", lineBreak: false });
      doc.font(F(title, true)).fontSize(12.5).fillColor(INK).text(title, 106, y + 26, { width: PW - 166 });
      doc.font(F(body, false)).fontSize(9).fillColor(INK60).text(body, 106, y + 50, { width: PW - 146, lineGap: 3.5 });
    }
    doc.y = y + 122;
  }
  doc.moveDown(0.5);
  doc.font(F(T.flowTitle, true)).fontSize(11).fillColor(INK).text(T.flowTitle, 48, doc.y, { width: PW });
  doc.moveDown(0.35);
  {
    const CW = (PW - 36) / 4;
    const y0 = doc.y;
    T.flowSteps.forEach(([t, d], i) => {
      const x = 48 + i * (CW + 12);
      doc.roundedRect(x, y0, CW, 76, 6).fill("#f2f7fd");
      doc.circle(x + 18, y0 + 17, 9).fill(BRAND);
      doc.font("b").fontSize(9).fillColor("#ffffff").text(String(i + 1), x + 14.5, y0 + 11.5, { lineBreak: false });
      doc.font(F(t, true)).fontSize(8.5).fillColor(INK).text(t, x + 10, y0 + 32, { width: CW - 20 });
      doc.font(F(d, false)).fontSize(7).fillColor(INK60).text(d, x + 10, y0 + 47, { width: CW - 20, lineGap: 2 });
      if (i < 3) doc.font("b").fontSize(11).fillColor(INK40).text("›", x + CW + 3, y0 + 30, { lineBreak: false });
    });
    doc.y = y0 + 88;
  }
  {
    const y = doc.y + 6;
    doc.roundedRect(50.5, y + 3, PW, 48, 8).fill("rgba(18,35,60,0.18)");
    doc.roundedRect(48, y, PW, 48, 8).fill(NAVY);
    doc.circle(72, y + 24, 10).fill(BRAND);
    doc.path(`M ${72 - 4.5} ${y + 24.5} L ${72 - 1} ${y + 28} L ${72 + 5.5} ${y + 20.5}`).lineWidth(2).lineCap("round").strokeColor("#ffffff").stroke();
    doc.font(F(T.ctaAction, true)).fontSize(10.5).fillColor("#ffffff").text(T.ctaAction, 94, y + 9, { width: PW - 60, lineBreak: false });
    doc.font(F(T.ctaContact(snap.meta.reportNo), false)).fontSize(8).fillColor("rgba(255,255,255,0.75)").text(T.ctaContact(snap.meta.reportNo), 94, y + 28, { width: PW - 62, lineBreak: false });
    doc.y = y + 58;
  }

  // ═══ 页眉页脚补绘（临时放开 margin 防自动分页炸页）═══
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    const savedBottom = doc.page.margins.bottom, savedTop = doc.page.margins.top;
    doc.page.margins.bottom = 0; doc.page.margins.top = 0;
    if (i > 0) {
      doc.font(F(T.headerLeft, false)).fontSize(7.5).fillColor(INK40).text(T.headerLeft, 48, 28, { lineBreak: false });
      doc.font("r").text(snap.meta.reportNo, 48, 28, { align: "right" });
      doc.moveTo(48, 42).lineTo(547.28, 42).lineWidth(0.5).strokeColor(LINE).stroke();
    }
    doc.font(F(T.pageFooter(i + 1, range.count), false)).fontSize(7.5).fillColor(INK40)
      .text(T.pageFooter(i + 1, range.count), 48, 806, { align: "center", lineBreak: false });
    doc.rect(0, 837.89, 595.28, 4).fill(BRAND); // 底边品牌收口条
    doc.page.margins.bottom = savedBottom; doc.page.margins.top = savedTop;
  }

  doc.end();
  await new Promise<void>((resolve, reject) => { stream.on("finish", resolve); stream.on("error", reject); });
  return outPath;
}
