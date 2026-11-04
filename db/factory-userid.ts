process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
async function main() {
  const db = getDb();
  try { await db.execute(sql`ALTER TABLE factories ADD COLUMN seller_user_id VARCHAR(32) NULL`); console.log("col added"); }
  catch (e: any) { console.log("col:", e?.message?.includes("Duplicate") ? "exists" : e?.message); }
  try { await db.execute(sql`CREATE INDEX ix_factories_uid ON factories (seller_user_id)`); console.log("idx added"); }
  catch (e: any) { console.log("idx:", e?.message?.includes("Duplicate") ? "exists" : e?.message); }
  const [t]: any = await db.execute(sql`SELECT REGEXP_REPLACE('b2b-221848889751404d29', '^b2b-([0-9]+).*', '\\\\1') AS uid`);
  console.log("regexp test:", t[0]);
  const r: any = await db.execute(sql`UPDATE factories SET seller_user_id = REGEXP_REPLACE(member_id, '^b2b-([0-9]+).*', '\\\\1') WHERE member_id LIKE 'b2b-%' AND seller_user_id IS NULL`);
  console.log("backfilled:", r[0]?.affectedRows);
  const [c]: any = await db.execute(sql`SELECT COUNT(*) c FROM factories WHERE seller_user_id IS NOT NULL`);
  console.log("factories with userId:", c[0].c);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
