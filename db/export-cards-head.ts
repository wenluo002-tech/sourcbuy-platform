// Mac 采集包头部名单（精确化版）：金/银/铜中月买家数缺口的 1,270 家
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
import fs from "fs";
const db = await getDb();
const [rows] = await db.execute(sql`
  SELECT id, name, member_id, tier FROM factories
  WHERE (is_trader IS NULL OR is_trader=0) AND dup_of IS NULL
    AND tier IN ('金标','银标','铜标') AND monthly_buyers IS NULL
    AND member_id IS NOT NULL AND member_id <> ''
  ORDER BY FIELD(tier,'金标','银标','铜标'), id`) as any;
const out = (rows as any[]).map((r) => ({ id: r.id, name: r.name, member_id: r.member_id }));
fs.writeFileSync("/mnt/agents/output/名单-头部1270家.json", JSON.stringify(out, null, 1));
const t: Record<string, number> = {};
for (const r of rows as any[]) t[r.tier] = (t[r.tier] ?? 0) + 1;
console.log("DONE " + out.length + " " + JSON.stringify(t));
process.exit(0);
