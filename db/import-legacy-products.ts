// 对方系统 products 全量导出（396,445 条/12 列，罗总 2026-11-09 交接）导入 legacy_products 表。
// 纪律（沿用 import-legacy / crawler v2 红线）：
//   ① 默认 dry-run，--execute 才写库；② 原样入库，绝不清洗改写原字段（体检口径见 README_数据说明与体检报告.md）；
//   ③ 缺失写 NULL 绝不填 0；④ 派生字段单列（moq_min 解析自起批量原文 / price_suspect 只打标不改价）；
//   ⑤ tier 是对方口径（tier≠分数档，3.3 节实证），存 tier_legacy 与我们五档分层物理隔离；
//   ⑥ 综合分是工厂快照分非商品分，字段名 factory_score 防止误用；
//   ⑦ 32.5% 商品无工厂档案是数据现状，如实入库，查询层 join 落空走降级；
//   ⑧ 幂等（product_id 主键），可断点重跑；v2 修复：image 列曾漏插，ON DUPLICATE 只补空 image 不覆盖；
//   ⑨ 入库后必须实际 SELECT 抽查（tags 事故教训——正是这条抓住了 image 漏插）。
// 用法: npx tsx db/import-legacy-products.ts <csv路径> [--execute] [--limit N]
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
import { createReadStream } from "fs";

const CSV_PATH = process.argv[2];
const EXECUTE = process.argv.includes("--execute");
const LIM_IDX = process.argv.indexOf("--limit");
const LIMIT = LIM_IDX > 0 ? parseInt(process.argv[LIM_IDX + 1], 10) : 0;
if (!CSV_PATH) { console.error("用法: npx tsx db/import-legacy-products.ts <csv路径> [--execute] [--limit N]"); process.exit(1); }

const CREATE_SQL = `CREATE TABLE legacy_products (
  product_id VARCHAR(32) PRIMARY KEY,
  title VARCHAR(512) NOT NULL,
  spec_json TEXT, spec_text TEXT,
  fine_category VARCHAR(128),
  member_id VARCHAR(64), factory_name VARCHAR(255),
  factory_score DECIMAL(4,1),
  tier_legacy VARCHAR(16),
  price_cny DECIMAL(12,2),
  price_suspect TINYINT NOT NULL DEFAULT 0,
  moq_text VARCHAR(64), moq_min INT,
  image TEXT,
  imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_lp_member (member_id), INDEX ix_lp_cat (fine_category), INDEX ix_lp_score (factory_score)
)`;

// ── RFC4180 流式 CSV 解析（BOM/CRLF/"" 引号转义/引号内换行），逐行回调，621MB 全量也压得住内存 ──
async function eachRow2(path: string, onRow: (cells: string[], lineNo: number) => Promise<boolean>): Promise<void> {
  const stream = createReadStream(path, { encoding: "utf8" });
  let field = "", row: string[] = [], inQ = false, lineNo = 1, first = true, stop = false, pendingCR = false;
  stream.on("close", () => {});
  for await (const chunk of stream) {
    if (stop) break;
    for (let i = 0; i < (chunk as string).length; i++) {
      const ch = (chunk as string)[i];
      if (first) { first = false; if (ch === "﻿") continue; }
      if (pendingCR) { pendingCR = false; if (ch === "\n") continue; } // \r\n 跨 chunk 边界也安全
      if (inQ) {
        if (ch === '"') {
          if ((chunk as string)[i + 1] === '"') { field += '"'; i++; } // "" → 字面引号
          else inQ = false;
        } else field += ch;
        continue;
      }
      if (ch === '"') { inQ = true; continue; }
      if (ch === ",") { row.push(field); field = ""; continue; }
      if (ch === "\r") { pendingCR = true; }
      if (ch === "\n" || ch === "\r") {
        row.push(field); field = "";
        lineNo++;
        if (!(await onRow(row, lineNo))) { stop = true; break; }
        row = [];
        continue;
      }
      field += ch;
    }
  }
  if (!stop && (row.length || field)) { row.push(field); await onRow(row, lineNo + 1); }
}

// 起批量自由文本 → 下限数值。解析不出/为空 → NULL（绝不编）。覆盖体检报告列举形态。
function parseMoq(raw: string | null): number | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  const m = s.match(/(\d[\d,]*)/);
  if (!m) return null;
  const n = parseInt(m[1].replace(/,/g, ""), 10);
  return Number.isFinite(n) && n > 0 && n < 10_000_000 ? n : null;
}

async function main() {
  const db = getDb();
  // 表存在性检查（新表手动建：不存在则给出 DDL 并退出）
  const t = await db.execute(sql`SHOW TABLES LIKE 'legacy_products'`) as any;
  const exists = (Array.isArray(t) ? (Array.isArray(t[0]) ? t[0] : t) : []).length > 0;
  if (!exists) {
    console.log(EXECUTE ? "❌ 表不存在。请先手动建表：\n" + CREATE_SQL : "[dry-run] 表尚不存在，建表 DDL：\n" + CREATE_SQL);
    if (EXECUTE) process.exit(1);
  }

  let total = 0, bad = 0, moqParsed = 0, moqNull = 0, priceSuspect = 0, priceNull = 0, memberNull = 0, dup = 0;
  const seen = new Set<string>();
  let batch: any[][] = [];
  const samples: any[] = [];

  // drizzle sql.raw 不带参数绑定 → 手工转义拼值（受控来源数据 + 全量转义）
  const esc = (v: any): string => {
    if (v === null || v === undefined) return "NULL";
    if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
    return "'" + String(v).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
  };
  const flush2 = async () => {
    if (batch.length === 0) return;
    if (EXECUTE) {
      const values = batch.map((r) => "(" + r.map(esc).join(",") + ")").join(",");
      // image 列历史漏插（v1 bug），ON DUPLICATE 只补空值不覆盖——幂等重跑即回填
      await db.execute(sql.raw(
        `INSERT INTO legacy_products
         (product_id,title,spec_json,spec_text,fine_category,member_id,factory_name,factory_score,tier_legacy,price_cny,price_suspect,moq_text,moq_min,image) VALUES ${values}
         ON DUPLICATE KEY UPDATE image = IF(image IS NULL OR image = '', VALUES(image), image)`));
    }
    batch = [];
  };

  let headerChecked = false;
  await eachRow2(CSV_PATH, async (cells) => {
    if (!headerChecked) {
      headerChecked = true;
      const expect = ["商品ID", "标题", "spec_json", "spec_text", "细品类", "会员ID", "工厂名", "综合分", "tier", "价格", "起批量", "图片"];
      const ok = expect.every((h, i) => (cells[i] || "").trim() === h);
      console.log(ok ? "✓ 表头 12 列与 schema 一致" : "⚠️ 表头不一致，实读：" + JSON.stringify(cells));
      return true;
    }
    total++;
    if (LIMIT && total > LIMIT) return false;
    const [pid, title, specJson, specText, fineCat, mid, fname, score, tier, price, moq, img] = cells.map((c) => (c ?? "").trim());
    if (!/^\d{6,20}$/.test(pid)) { bad++; if (bad <= 5) console.log(`  ✗ 非法商品ID 第${total}行: "${pid.slice(0, 40)}"`); return true; }
    if (seen.has(pid)) { dup++; return true; }
    seen.add(pid);
    const priceN = price === "" ? null : parseFloat(price);
    const suspect = priceN != null && (!Number.isFinite(priceN) || priceN > 100000 || priceN <= 0) ? 1 : 0;
    if (suspect) priceSuspect++;
    if (priceN == null) priceNull++;
    const moqMin = parseMoq(moq);
    if (moqMin != null) moqParsed++; else moqNull++;
    if (!mid) memberNull++;
    const scoreN = score === "" ? null : parseFloat(score);
    if (samples.length < 3) samples.push({ pid, title: title.slice(0, 30), fineCat, mid, score: scoreN, tier, price: priceN, moqMin });
    batch.push([
      pid, title || "(无标题)", specJson || null, specText || null, fineCat || null,
      mid || null, fname || null,
      scoreN != null && Number.isFinite(scoreN) ? Math.round(scoreN * 10) / 10 : null,
      tier || null,
      suspect ? priceN : (priceN != null && Number.isFinite(priceN) ? priceN : null), // 异常价也原样存，靠 flag 隔离
      suspect,
      moq || null, moqMin,
      img || null,
    ]);
    if (batch.length >= 500) await flush2();
    if (total % 50000 === 0) console.log(`  …已处理 ${total.toLocaleString()} 行`);
    return true;
  });
  await flush2();

  console.log("\n════════ 导入" + (EXECUTE ? "结果" : "预演（dry-run，未写库）") + " ════════");
  console.log(`总行数 ${total.toLocaleString()} | 非法ID跳过 ${bad} | 文件内重复 ${dup}`);
  console.log(`起批量：解析出下限 ${moqParsed.toLocaleString()} (${(moqParsed / total * 100).toFixed(1)}%) | 缺失/不可解析 ${moqNull.toLocaleString()}`);
  console.log(`价格：异常打标 ${priceSuspect.toLocaleString()}（>10万 或 ≤0）| 空价 ${priceNull.toLocaleString()}`);
  console.log(`会员ID 空（无法回溯工厂）: ${memberNull.toLocaleString()}`);
  console.log("样例 3 条：", JSON.stringify(samples, null, 1));

  if (EXECUTE) {
    // 入库后实际 SELECT 抽查（硬规矩）
    const c = await db.execute(sql`SELECT COUNT(*) AS n, COUNT(DISTINCT member_id) AS mids,
      SUM(price_suspect) AS suspects, SUM(moq_min IS NOT NULL) AS moqs FROM legacy_products`) as any;
    const row = (Array.isArray(c) && Array.isArray(c[0]) ? c[0] : c)[0] as any;
    console.log("\n═══ 库内抽查 ═══", JSON.stringify(row));
    const spot = await db.execute(sql`SELECT product_id, title, fine_category, member_id, price_cny, moq_min FROM legacy_products ORDER BY RAND() LIMIT 3`) as any;
    console.log("随机抽查 3 条：", JSON.stringify(Array.isArray(spot) && Array.isArray(spot[0]) ? spot[0] : spot, null, 1));
  } else {
    console.log("\n（dry-run 完成。确认无误后加 --execute 正式导入；新表需先按上方 DDL 手动建表）");
  }
  process.exit(0);
}

main().catch((e) => { console.error("❌", e); process.exit(1); });
