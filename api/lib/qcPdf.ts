// 质检报告 PDF 生成（买家向，英文为主；内嵌 JPEG/PNG 证据图；视频证据列条目不内嵌）
// 字体：NotoSansCJK-Regular.ttc（named family）——productTitle/批注可能含中文，标准 PDF 字体渲染不了 CJK
// pdfkit 必须运行时 require（不进 esbuild bundle）：打 server bundle 时的 createRequire banner 会与
// pdfkit.node.mjs 自带的 `import { createRequire }` 撞名（重复声明直接 SyntaxError）；
// createRequire 调用 esbuild 不静态跟进，运行时从 node_modules 解析 exports 的 require 分支（纯 CJS）。
import { createRequire as mkRequire } from "node:module"; // 别名防与 esbuild banner 的 createRequire 撞名
import type PDFKit from "pdfkit";
const PDFDocument = (mkRequire(import.meta.url)("pdfkit")) as typeof PDFKit;
import fs from "node:fs";
import path from "node:path";
import { getOpsDetail, setPdfPath } from "../queries/inspection";
import { COMPENSATION, PHASE_LABEL, QC_PRICING_NOTE } from "../../contracts/inspection";

export const UPLOAD_ROOT = path.resolve(process.cwd(), "uploads");

const CJK_FONT = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc";
const CJK_FAMILY = "NotoSansCJKsc-Regular";

const VERDICT_EN: Record<string, string> = {
  pass: "PASS",
  conditional: "CONDITIONAL PASS (accepted with remarks)",
  rework: "REWORK REQUIRED",
  reject: "REJECTED",
};

export async function generateReportPdf(reportId: number): Promise<string> {
  const d = await getOpsDetail(reportId);
  if (!d) throw new Error("report not found");
  const dir = path.join(UPLOAD_ROOT, "qc", String(reportId));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${d.reportNo}.pdf`);

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const stream = fs.createWriteStream(file);
    doc.pipe(stream);
    stream.on("finish", resolve);
    stream.on("error", reject);

    // 默认字体：能同时渲染中英文（买家报告以英文为主，中文品名/批注也能正常显示）
    try {
      doc.font(CJK_FONT, CJK_FAMILY);
    } catch {
      /* 字体缺失时退回 Helvetica（中文会缺失，但不至于崩） */
    }

    const W = doc.page.width - 96;
    let y = doc.y;

    // ── 抬头 ──
    doc.fontSize(18).text("SourcBuy Inspection Report", { width: W });
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor("#444")
      .text(`Report No: ${d.reportNo}    Phase: ${PHASE_LABEL[d.phase as 1 | 2].en}`, { width: W })
      .text(`Date: ${(d.reviewedAt ?? d.createdAt).toISOString().slice(0, 10)}`, { width: W });
    doc.moveDown(0.6);

    // ── 订单信息 ──
    doc.fontSize(13).fillColor("#000").text("Order", { width: W });
    doc.fontSize(10.5).fillColor("#222");
    if (d.order) {
      doc.text(`Order No: ${d.order.orderNo}`, { width: W });
      if (d.order.productTitle) doc.text(`Product: ${d.order.productTitle}`, { width: W });
      if (d.order.quantity) doc.text(`Quantity: ${d.order.quantity} pcs`, { width: W });
      if (d.order.destination) doc.text(`Destination: ${d.order.destination}`, { width: W });
    }
    doc.moveDown(0.6);

    // ── 判定 ──
    if (d.verdict) {
      doc.fontSize(13).fillColor("#000").text("Verdict", { width: W });
      doc.fontSize(12)
        .fillColor(d.verdict === "pass" ? "#0a7a30" : d.verdict === "conditional" ? "#9a6a00" : "#b00020")
        .text(VERDICT_EN[d.verdict] ?? d.verdict.toUpperCase(), { width: W });
      if (d.inspectorNote) {
        doc.moveDown(0.2).fontSize(10.5).fillColor("#222").text(`Inspector remarks: ${d.inspectorNote}`, { width: W });
      }
      doc.moveDown(0.6);
    }

    // ── 二检实测 ──
    if (d.phase === 2 && (d.measuredWeightKg || d.measuredVolumeCbm)) {
      doc.fontSize(13).fillColor("#000").text("Measured at Warehouse", { width: W });
      doc.fontSize(10.5).fillColor("#222");
      if (d.measuredWeightKg) doc.text(`Gross weight: ${d.measuredWeightKg} kg`, { width: W });
      if (d.measuredVolumeCbm) doc.text(`Volume: ${d.measuredVolumeCbm} CBM`, { width: W });
      doc.moveDown(0.6);
    }

    // ── 清单项 + 证据 ──
    doc.fontSize(13).fillColor("#000").text(`Checklist — ${d.template.nameEn}`, { width: W });
    doc.moveDown(0.3);
    for (const item of d.template.items) {
      const evs = d.evidences.filter((e) => e.itemCode === item.code);
      const photos = evs.filter((e) => e.mediaType === "photo" && /\.(jpe?g|png|webp)$/i.test(e.filePath));
      const others = evs.length - photos.length;
      doc.fontSize(11).fillColor("#000")
        .text(`• ${item.labelEn}${item.required ? " *" : ""} — ${evs.length} file(s)${others > 0 ? ` (incl. ${others} video/doc, archived)` : ""}`, { width: W });
      // 内嵌照片（每项最多 3 张，防 PDF 膨胀）
      for (const ev of photos.slice(0, 3)) {
        const abs = path.join(UPLOAD_ROOT, ev.filePath);
        try {
          if (fs.existsSync(abs)) {
            if (doc.y > doc.page.height - 260) doc.addPage();
            doc.image(abs, { fit: [220, 160] });
            doc.moveDown(0.3);
          }
        } catch {
          /* 单张图挂了不挡整份报告 */
        }
      }
      doc.moveDown(0.15);
      y = doc.y;
    }
    void y;

    // ── 承诺与定价口径 ──
    if (doc.y > doc.page.height - 200) doc.addPage();
    doc.moveDown(0.6);
    doc.fontSize(10).fillColor("#555")
      .text(COMPENSATION.lineEn, { width: W })
      .text(QC_PRICING_NOTE.en, { width: W })
      .text("Inspection verdicts are made by SourcBuy human inspectors. AI-assisted pre-checks never replace human judgment.", { width: W });

    doc.end();
  });

  await setPdfPath(reportId, path.relative(UPLOAD_ROOT, file));
  return file;
}
