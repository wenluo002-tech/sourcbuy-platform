// 导出待采集工厂名单（Mac 单机版采集包用）：与 factory-cards.ts 同一 WHERE 口径
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
import fs from "fs";

const db = getDb();
const [rows]: any = await db.execute(sql`
  SELECT id, name, member_id, seller_user_id, years, repurchase_rate, production_type, oem_mode, home, area_sqm, cert, tier
  FROM factories
  WHERE is_trader=0 AND dup_of IS NULL AND cards_checked_at IS NULL
    AND (home IS NULL OR home='' OR oem_mode IS NULL OR production_type IS NULL
         OR member_id NOT REGEXP '^b2b-[0-9]' OR years IS NULL OR repurchase_rate IS NULL
         OR seller_user_id IS NULL OR seller_user_id='')
  ORDER BY FIELD(tier,'金标','银标','铜标','优选','培育'), id
`);
const out = (rows as any[]).map((r) => ({ id: r.id, name: r.name, member_id: r.member_id ?? null }));
fs.writeFileSync("/mnt/agents/output/1688采集包-Mac版/名单.json", JSON.stringify(out, null, 1));
console.log(`导出 ${out.length} 家 → 名单.json`);
const tiers: Record<string, number> = {};
for (const r of rows as any[]) tiers[r.tier] = (tiers[r.tier] ?? 0) + 1;
console.log("分层分布:", JSON.stringify(tiers));
process.exit(0);
