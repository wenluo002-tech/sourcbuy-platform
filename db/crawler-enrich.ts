// 商品池富化：走罗总提供的爬虫接口（sunclub，详情源）补 三级类目路径 + SKU 中位重量 + 外贸属性
// 幂等：只抓 cat_path 为空的；PILOT=数字 控制试跑量；默认每日上限 2000（额度未知先保守）
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";

const BASE = process.env.SUNCLUB_BASE;
const PILOT = Number(process.env.PILOT || 0);
const DAILY_CAP = 2000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function ensureColumns(db: any) {
  const [c1] = (await db.execute(sql`SHOW COLUMNS FROM offer_pool LIKE 'cat_path'`)) as any;
  if (!(c1 as any[]).length) {
    await db.execute(sql`ALTER TABLE offer_pool ADD COLUMN cat_path VARCHAR(255) NULL`);
    console.log("已加列 cat_path");
  }
  const [c2] = (await db.execute(sql`SHOW COLUMNS FROM offer_pool LIKE 'weight_g'`)) as any;
  if (!(c2 as any[]).length) {
    await db.execute(sql`ALTER TABLE offer_pool ADD COLUMN weight_g INT NULL`);
    console.log("已加列 weight_g");
  }
}

async function main() {
  if (!BASE) throw new Error("SUNCLUB_BASE 未配置");
  const db = getDb();
  await ensureColumns(db);
  // 优先补能 join 上严选厂（非贸易商）的货——这批直接强化"以货带厂"证据
  const [rows] = (await db.execute(sql`
    SELECT p.offer_id FROM offer_pool p
    LEFT JOIN factories f ON f.seller_user_id = p.seller_user_id AND f.is_trader = 0
    WHERE p.cat_path IS NULL
    ORDER BY (f.id IS NOT NULL) DESC, p.sales DESC
    LIMIT ${PILOT || DAILY_CAP}`)) as any;
  console.log(`本轮目标 ${(rows as any[]).length} 条（PILOT=${PILOT || "关"}）`);
  let ok = 0, fail = 0;
  for (const r of rows as any[]) {
    const t0 = Date.now();
    try {
      const resp = await fetch(`${BASE}/api/alibabaformat/offER?OFFERID=${r.offer_id}`, { signal: AbortSignal.timeout(15000) });
      const d = (await resp.json()) as any;
      if (d?.Success !== true || !d?.Data) throw new Error(String(d?.Message || "not ok").slice(0, 120));
      const catPath: string | null = d.Data.CategoryName || null;
      // SKU 中位重量（克），0 值剔除
      const ws: number[] = (d.Data.Tags?.pieceWeightScale?.pieceWeightScaleInfo ?? [])
        .map((x: any) => Number(x.weight)).filter((w: number) => w > 0).sort((a: number, b: number) => a - b);
      const weightG = ws.length ? Math.round(ws[Math.floor(ws.length / 2)]) : null;
      await db.execute(sql`UPDATE offer_pool SET cat_path=${catPath}, weight_g=${weightG} WHERE offer_id=${r.offer_id}`);
      ok++;
      // 台账（费用未知记 0，来源记 sunclub）
      await db.execute(sql`INSERT INTO sourcing_api_logs (provider, endpoint, offer_id, cost_cny, billed, ok, duration_ms) VALUES ('sunclub','offer',${r.offer_id},0,0,1,${Date.now() - t0})`);
    } catch (e: any) {
      fail++;
      await db.execute(sql`INSERT INTO sourcing_api_logs (provider, endpoint, offer_id, cost_cny, billed, ok, duration_ms, error) VALUES ('sunclub','offer',${r.offer_id},0,0,0,${Date.now() - t0},${String(e.message).slice(0, 200)})`);
      console.log(`  失败 ${r.offer_id}: ${e.message}`);
    }
    if (ok % 50 === 0 && ok > 0) console.log(`  进度: ${ok} 成功 / ${fail} 失败`);
    await sleep(500);
  }
  console.log(`完成: ${ok} 成功 / ${fail} 失败`);
  process.exit(0);
}
main();
