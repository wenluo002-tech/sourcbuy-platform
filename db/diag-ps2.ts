process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { offerPool, factories } from "../db/schema";
import { and, desc, gt, sql } from "drizzle-orm";
async function main() {
  const db = getDb();
  const likeConds = [sql`${offerPool.title} LIKE ${"%衣架%"}`];
  const vettedJoin = sql`${factories.memberId} = ${offerPool.memberId}
    OR ${factories.memberId} = ${offerPool.sellerLoginId}
    OR (${offerPool.sellerUserId} IS NOT NULL AND ${factories.memberId} LIKE CONCAT('b2b-', ${offerPool.sellerUserId}, '%'))`;
  const rows = await db
    .select({
      offerId: offerPool.offerId,
      title: offerPool.title,
      sales: offerPool.sales,
      vetted: sql<number>`CASE WHEN ${factories.id} IS NOT NULL THEN 1 ELSE 0 END`,
    })
    .from(offerPool)
    .leftJoin(factories, vettedJoin)
    .where(and(sql`(${sql.join(likeConds, sql` OR `)})`, gt(offerPool.sales, 0)))
    .orderBy(desc(sql`vetted`), desc(offerPool.sales), desc(offerPool.lastSeenAt))
    .limit(8);
  console.log("rows:", rows.length);
  for (const r of rows) console.log(` vetted=${r.vetted} 销${r.sales} ${r.title.slice(0, 30)}`);
  process.exit(0);
}
main().catch((e) => { console.error("ERR:", e?.message); process.exit(1); });
