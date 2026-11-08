process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
import fs from "fs";
const KEY = process.env.WANBANG_KEY!;
const SECRET = process.env.WANBANG_SECRET!;
const db = getDb();

// 1) employee_count 列类型
const [cols]: any = await db.execute(sql`SHOW COLUMNS FROM factories LIKE 'employee_count'`);
console.log("employee_count 列:", JSON.stringify(cols));

// 2) 挑一个老格式 loginId 的厂测 seller_info 的 nick 参数形态
const [rows]: any = await db.execute(sql`
  SELECT id, name, member_id FROM factories
  WHERE member_id NOT LIKE 'b2b-%' AND member_id IS NOT NULL AND member_id <> ''
    AND (is_trader IS NULL OR is_trader = 0) AND dup_of IS NULL
  LIMIT 2
`);
console.log("loginId 样本:", JSON.stringify(rows));

async function probe(params: Record<string, string>, tag: string) {
  const qs = new URLSearchParams({ key: KEY, secret: SECRET, lang: "zh-CN", cache: "yes", ...params });
  const res = await fetch(`https://api-gw.onebound.cn/1688/seller_info/?${qs}`, { signal: AbortSignal.timeout(30000) });
  const j: any = await res.json();
  console.log(`\n===== seller_info ${tag} =====`);
  console.log("error_code:", j?.error_code, "| title:", j?.title ?? j?.items?.title ?? null, "| nick:", j?.nick ?? null, "| tpyear:", j?.tpyear ?? null, "| star:", j?.star ?? null);
  fs.writeFileSync(`/tmp/probe-seller-${tag.replace(/\W+/g, "_")}.json`, JSON.stringify(j, null, 2));
}

if (rows[0]) await probe({ nick: rows[0].member_id }, `nick-${rows[0].member_id}`);
await new Promise(r => setTimeout(r, 1200));
// 再试 sid 参数名 + 老 loginId
if (rows[0]) await probe({ sid: rows[0].member_id }, `sid_${rows[0].member_id}`);
process.exit(0);
