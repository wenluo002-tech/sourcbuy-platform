// v48 schema 修正：offers/offer_pool 加 seller_login_id；清掉错格式的 memberId（shopXXX 是店铺子域名，join 不上严选库）
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";

async function main() {
  const db = getDb();
  for (const t of ["offers", "offer_pool"]) {
    try {
      await db.execute(sql.raw(`ALTER TABLE ${t} ADD COLUMN seller_login_id VARCHAR(64) NULL`));
      console.log(`${t}: seller_login_id added`);
    } catch (e: any) {
      console.log(`${t}: ${e?.message?.includes("Duplicate") ? "column exists" : e?.message}`);
    }
  }
  try {
    await db.execute(sql`CREATE INDEX ix_pool_login ON offer_pool (seller_login_id)`);
    console.log("ix_pool_login created");
  } catch (e: any) {
    console.log("index:", e?.message?.includes("Duplicate") ? "exists" : e?.message);
  }
  // 清错格式：shopXXX 子域名永远 join 不上，置 NULL 让下次拉详情重写正确值
  const r1: any = await db.execute(sql`UPDATE offer_pool SET member_id = NULL, detail_fetched_at = NULL WHERE member_id LIKE 'shop%'`);
  const r2: any = await db.execute(sql`UPDATE offers SET member_id = NULL WHERE member_id LIKE 'shop%'`);
  console.log("pool member_id cleaned:", r1[0]?.affectedRows, "offers cleaned:", r2[0]?.affectedRows);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
