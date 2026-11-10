process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
const db = getDb();
for (const w of ["衣架", "瑜伽裤", "保温杯", "LED"]) {
  const r: any = await db.execute(sql.raw(`SELECT COUNT(*) c FROM legacy_products WHERE title LIKE '%${w}%' AND price_suspect=0 AND price_cny>0.01 AND price_cny<50000 AND image IS NOT NULL AND image!='' AND (tier_legacy IS NULL OR tier_legacy!='死链')`));
  const j: any = await db.execute(sql.raw(`SELECT COUNT(*) c FROM legacy_products lp WHERE lp.title LIKE '%${w}%' AND lp.price_suspect=0 AND lp.price_cny>0.01 AND lp.price_cny<50000 AND lp.image IS NOT NULL AND lp.image!='' AND (lp.tier_legacy IS NULL OR lp.tier_legacy!='死链') AND EXISTS (SELECT 1 FROM factories f WHERE f.member_id=lp.member_id AND f.is_trader=0 AND f.dup_of IS NULL)`));
  console.log(w, "召回", r[0][0].c, "| 其中严选厂", j[0][0].c);
}
process.exit(0);
