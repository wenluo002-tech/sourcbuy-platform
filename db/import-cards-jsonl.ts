// Mac 采集包结果导入器：读 结果.jsonl → 只填 NULL 空位、评分列绝不写、member_id 查冲突、打 cards_checked_at、台账 provider='1688web-mac'
// 用法：npx tsx db/import-cards-jsonl.ts [结果文件路径]   （默认 dry-run；--execute 落库）
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
import fs from "fs";

const EXECUTE = process.argv.includes("--execute");
const file = process.argv.find((a) => a.endsWith(".jsonl")) ?? "/mnt/agents/upload/结果.jsonl";
if (!fs.existsSync(file)) { console.log(`找不到结果文件：${file}`); process.exit(1); }

const db = getDb();
const lines = fs.readFileSync(file, "utf8").split("\n").filter((l) => l.trim());
console.log(`结果文件 ${lines.length} 行，${EXECUTE ? "正式落库" : "DRY-RUN 演练"}`);

let updated = 0, marked = 0, skippedNoFactory = 0, skippedDupLine = 0, collisions = 0;
const seen = new Set<number>();

for (const line of lines) {
  let rec: any;
  try { rec = JSON.parse(line); } catch { continue; }
  const id = Number(rec.id);
  if (!id || seen.has(id)) { skippedDupLine++; continue; }
  seen.add(id);

  const [rows]: any = await db.execute(sql`
    SELECT id, name, member_id, seller_user_id, years, repurchase_rate, monthly_buyers, is_super, deep_inspected, production_type, oem_mode, home, area_sqm, cert, tags
    FROM factories WHERE id=${id} LIMIT 1`);
  const f = rows?.[0];
  if (!f) { skippedNoFactory++; continue; }

  const writes: Record<string, unknown> = {};
  const c = rec.card;
  if (rec.matched && c) {
    if (!f.home && c.winport) writes.home = `https://${c.winport}.1688.com`;
    if (f.years == null && c.years != null) writes.years = c.years;
    if (f.repurchase_rate == null && c.repurchase != null) writes.repurchase_rate = c.repurchase;
    // 月买家数：直读 monthlyBuyers，兼容卡片 info 原始键值「月买家数」（纯数字才采）
    const mb = c.monthlyBuyers ?? String(c.info?.["月买家数"] ?? "").match(/\d+/)?.[0];
    if (f.monthly_buyers == null && mb != null && Number(mb) > 0) writes.monthly_buyers = Number(mb);
    // 徽章只写正向信号：卡片明确展示才写 1，不展示不动（缺席≠否定）
    if (c.isSuper === true && (f.is_super == null || f.is_super === 0)) writes.is_super = 1;
    if (c.deepInspected === true && (f.deep_inspected == null || f.deep_inspected === 0)) writes.deep_inspected = 1;
    if (!f.production_type && c.ptype) writes.production_type = c.ptype;
    if (!f.oem_mode && Array.isArray(c.oem) && c.oem.length) writes.oem_mode = c.oem.join("/");
    if (f.area_sqm == null && c.areaSqm != null) writes.area_sqm = c.areaSqm;
    if (!f.cert && c.cert) writes.cert = String(c.cert).replace(/\s*\|\s*$/, "");
    const uidM = String(c.memberId ?? "").match(/^b2b-(\d+)/);
    if ((!f.seller_user_id || f.seller_user_id === "") && uidM) writes.seller_user_id = uidM[1];
    if (!/^b2b-\d/.test(f.member_id ?? "") && c.memberId) {
      const [dup]: any = await db.execute(sql`SELECT id FROM factories WHERE member_id=${c.memberId} AND id<>${f.id} LIMIT 1`);
      if (!dup.length) writes.member_id = c.memberId; else collisions++;
    }
    if (c.mainCraft) {
      let tags: string[] = [];
      try { tags = JSON.parse(f.tags ?? "[]"); } catch { tags = []; }
      const add = String(c.mainCraft).split(/[|、,，]/).map((s) => s.trim()).filter((s) => s && !tags.includes(s));
      if (add.length) writes.tags = JSON.stringify([...tags, ...add]);
    }
  }

  if (EXECUTE) {
    const keys = Object.keys(writes).filter((k) => /^[a-z_]+$/.test(k));
    if (keys.length) {
      const sets = keys.map((k) => sql`${sql.raw(k)} = ${writes[k] as any}`);
      await db.execute(sql`UPDATE factories SET ${sql.join(sets, sql`, `)} WHERE id=${f.id}`);
      updated++;
    }
    await db.execute(sql`UPDATE factories SET cards_checked_at=NOW() WHERE id=${f.id}`);
    marked++;
    await db.execute(sql`INSERT INTO sourcing_api_logs (provider, endpoint, query, cost_cny, billed, ok, duration_ms, error) VALUES ('1688web-mac','company_search',${f.name},0,false,${!!rec.matched},0,${rec.matched ? null : "no-match"})`).catch(() => {});
  } else if (Object.keys(writes).length) {
    updated++;
    console.log(`  [dry] #${f.id} ${f.name.slice(0, 16)} 将写: ${Object.keys(writes).join(",")}`);
  }
}

console.log(`完成：可更新 ${updated} 家，标记已采 ${EXECUTE ? marked : "(dry)"} 家，库里无此厂 ${skippedNoFactory}，重复行跳过 ${skippedDupLine}，member_id 冲突跳过 ${collisions}`);
if (!EXECUTE) console.log("确认无误后加 --execute 正式落库");
process.exit(0);
