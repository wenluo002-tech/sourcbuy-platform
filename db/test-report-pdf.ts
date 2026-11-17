// P4 PDF 渲染重测：复用已生成快照直接渲染（不重复花 TXGC 费用）
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql as dsql } from "drizzle-orm";
import { renderReportPdf } from "../api/lib/reportPdf";

const db = getDb();
const r: any = await db.execute(dsql`SELECT report, locale, pdf_path FROM verification_reports WHERE report_no = 'SB-VR-TEST-001' LIMIT 1`);
const row = r[0]?.[0];
if (!row?.report) { console.error("无快照"); process.exit(1); }
const snap = typeof row.report === "string" ? JSON.parse(row.report) : row.report;
const p = await renderReportPdf(snap, row.locale ?? "zh");
await db.execute(dsql`UPDATE verification_reports SET pdf_path = ${p} WHERE report_no = 'SB-VR-TEST-001'`);
console.log("OK", p);
process.exit(0);
