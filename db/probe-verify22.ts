process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
const KEY = process.env.WANBANG_KEY!;
const SECRET = process.env.WANBANG_SECRET!;
const db = getDb();
const [rows]: any = await db.execute(sql`SELECT id,name,member_id,production_type,oem_mode,cert,employee_count,area_sqm,service_capability,home,years FROM factories WHERE id IN (22,25,38,73,74)`);
for (const f of rows) console.log(`[${f.id}] ${f.name}: ptype=${f.production_type} oem=${f.oem_mode} cert=${f.cert} emp=${f.employee_count} area=${f.area_sqm} svc=${f.service_capability} home=${f.home} years=${f.years}`);
// 拉一家原始返回对照
const f = rows[0];
const qs = new URLSearchParams({ key: KEY, secret: SECRET, lang: "zh-CN", cache: "yes", sid: f.member_id });
const j: any = await (await fetch(`https://api-gw.onebound.cn/1688/item_get_shop/?${qs}`)).json();
console.log(`\n[${f.id}] API 原始 detail:`);
for (const sec of j.detail ?? []) for (const [sn, items] of Object.entries(sec)) {
  console.log(`  ${sn}:`);
  for (const it of items as any[]) for (const [k, v] of Object.entries(it)) console.log(`    ${k} = ${String(v).replace(/\n/g, " / ").slice(0, 80)}`);
}
process.exit(0);
