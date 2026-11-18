/**
 * 天眼查企业信息平台通道（2026-11-18，核查报告兜底数据源）
 * 通道：服务端 fetch agent-gw /tools（call_data_source_tool → tianyancha_api_call）
 *   ——凭证 KIMI_AGENTGW_* 只在服务端 .env，绝不入记忆/git/浏览器（全员凭证纪律）
 * 口径纪律：天眼查=工商公示数据的聚合平台，报告角标用「官方公示」但 detail 必须注明
 *   「经企业信息平台查询」，不冒充官方公示本尊；风险标签（被执行人/司法案件）只列
 *   「待人工核实」，结论永不评级（报告五段防打架铁律）
 * 台账：每次调用写 tyc_calls；日熔断 TYC_DAILY_MAX=300 次防失控
 */
import { getDb } from "../queries/connection";
import { sql as dsql } from "drizzle-orm";

export interface TycBaseInfo {
  name: string;
  regStatus: string;            // 存续/在业/注销…
  creditCode: string | null;    // 统一社会信用代码
  regCapital: string | null;    // "500万人民币"
  establishDate: string | null; // YYYY-MM-DD（由 estiblishTime 毫秒换算）
  legalPerson: string | null;
  socialStaffNum: number | null; // 年报社保参保人数
  staffNumRange: string | null;  // "500-999人"
  businessScope: string | null;
  regLocation: string | null;
  industry: string | null;       // 行业门类（如 家具制造业）
  tags: string[];                // 存续;高新技术企业;被执行人;司法案件…
}

const TYC_DAILY_MAX = 300;

/** 引号感知 CSV 单行解析（天眼查 data_preview 为 CSV 文本） */
function parseCsvRow(line: string): string[] {
  const out: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function msToDate(ms: string | undefined): string | null {
  const n = Number(ms);
  if (!n || Number.isNaN(n)) return null;
  return new Date(n).toISOString().slice(0, 10);
}

/** 从 agent-gw 响应里抠 CSV 文本：优先 files[].content，退回 result 文本里的 data_preview JSON */
function extractCsv(raw: Record<string, unknown>): string | null {
  const files = raw.files as { content?: string }[] | undefined;
  if (Array.isArray(files) && files[0]?.content?.includes(",")) return files[0].content;
  const result = raw.result as { user?: { text?: string }[]; assistant?: { text?: string }[] } | undefined;
  for (const blk of [...(result?.assistant ?? []), ...(result?.user ?? [])]) {
    const t = blk?.text;
    if (!t) continue;
    // 文本本身是 JSON 串（含 data_preview 字段）
    try {
      const j = JSON.parse(t) as { data_preview?: string };
      if (j.data_preview?.includes(",")) return j.data_preview;
    } catch { /* 非 JSON 文本块跳过 */ }
  }
  return null;
}

async function logCall(name: string, ok: boolean, err?: string) {
  const db = getDb();
  await db.execute(dsql`INSERT INTO tyc_calls (company_name, ok, err) VALUES (${name}, ${ok ? 1 : 0}, ${err?.slice(0, 200) ?? null})`).catch(() => {});
}

/** 查企业基本信息；未收录返回 null；通道故障/熔断抛错（调用方 catch 后按未收录降级，绝不阻塞报告） */
export async function tycBaseInfo(companyName: string): Promise<TycBaseInfo | null> {
  const base = (process.env.KIMI_AGENTGW_BASE_URL ?? "").replace(/\/$/, "");
  const key = process.env.KIMI_AGENTGW_API_KEY;
  if (!base || !key) return null; // 通道未配置=降级，不炸报告

  // 日熔断
  const db = getDb();
  const cntRes = (await db.execute(dsql`SELECT COUNT(*) AS n FROM tyc_calls WHERE created_at >= CURDATE()`).catch(() => null)) as unknown as [Array<{ n: number | string }>] | null;
  const today = Number(cntRes?.[0]?.[0]?.n ?? 0);
  if (today >= TYC_DAILY_MAX) { await logCall(companyName, false, "daily_fuse"); return null; }

  const res = await fetch(`${base}/tools`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      method: "call_data_source_tool",
      params: {
        data_source_name: "tianyancha",
        api_name: "tianyancha_api_call",
        params: {
          api_call_name: "工商信息-企业基本信息",
          api_call_params: { keyword: companyName },
          file_path: "/tmp/tyc_call.csv",
        },
      },
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) { await logCall(companyName, false, `http_${res.status}`); return null; }
  const raw = (await res.json()) as Record<string, unknown>;
  if (raw.is_success !== true) { await logCall(companyName, false, String(raw.error ?? "not_success").slice(0, 120)); return null; }

  const csv = extractCsv(raw);
  if (!csv) { await logCall(companyName, false, "no_csv"); return null; }
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) { await logCall(companyName, false, "empty_rows"); return null; }
  const head = parseCsvRow(lines[0]);
  const row = parseCsvRow(lines[1]);
  const val = (k: string) => { const i = head.indexOf(k); return i >= 0 ? (row[i] ?? "") : ""; };
  const name = val("name").trim();
  if (!name) { await logCall(companyName, false, "not_found"); return null; } // 未收录

  const staffRaw = val("socialStaffNum").trim();
  await logCall(companyName, true);
  return {
    name,
    regStatus: val("regStatus").trim() || "—",
    creditCode: val("creditCode").trim() || null,
    regCapital: val("regCapital").trim() || null,
    establishDate: msToDate(val("estiblishTime")),
    legalPerson: val("legalPersonName").trim() || null,
    socialStaffNum: staffRaw !== "" && !Number.isNaN(Number(staffRaw)) ? Number(staffRaw) : null,
    staffNumRange: val("staffNumRange").trim() || null,
    businessScope: val("businessScope").trim() || null,
    regLocation: val("regLocation").trim() || null,
    industry: (val("industryAll.categoryMiddle") || val("industry")).trim() || null,
    tags: val("tags").split(";").map((s) => s.trim()).filter(Boolean),
  };
}
