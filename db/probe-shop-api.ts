// 探针：万邦 seller_info / item_get_shop 接口实测（各调 1 次，dump 字段结构）
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
import fs from "fs";

const KEY = process.env.WANBANG_KEY!;
const SECRET = process.env.WANBANG_SECRET!;
const BASE = "https://api-gw.onebound.cn/1688";

const db = getDb();
const [sampleRows]: any = await db.execute(sql`
  SELECT id, name, member_id FROM factories
  WHERE member_id LIKE 'b2b-%' AND tier = '金标' AND (is_trader IS NULL OR is_trader = 0) AND dup_of IS NULL
  LIMIT 3
`);
console.log("测试样本:", JSON.stringify(sampleRows));

async function probe(endpoint: string, sid: string) {
  const qs = new URLSearchParams({ key: KEY, secret: SECRET, lang: "zh-CN", cache: "yes", sid });
  const url = `${BASE}/${endpoint}/?${qs}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    const j: any = await res.json();
    console.log(`\n===== ${endpoint} (sid=${sid}) HTTP ${res.status} =====`);
    console.log("error_code:", j?.error_code, "| error:", j?.error ?? "(none)");
    fs.writeFileSync(`/tmp/probe-${endpoint}.json`, JSON.stringify(j, null, 2));
    const top = j?.items ?? j?.item ?? j?.data ?? j;
    if (top && typeof top === "object") {
      const obj = Array.isArray(top) ? top[0] : top;
      console.log("顶层键:", Object.keys(obj ?? {}).join(", "));
    }
  } catch (e: any) {
    console.log(`===== ${endpoint} 异常: ${e.message} =====`);
  }
}

const sid = sampleRows[0]?.member_id;
console.log("用 sid =", sid, "厂名 =", sampleRows[0]?.name);
await probe("seller_info", sid);
await new Promise(r => setTimeout(r, 1200));
await probe("item_get_shop", sid);
process.exit(0);
