import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
const db = await getDb();
const [cols] = await db.execute(sql`SHOW COLUMNS FROM factories`) as any;
const names = (cols as any[]).map(c => c.Field);
console.log("COLS " + names.join(","));
const [r] = await db.execute(sql`
  SELECT tier, COUNT(*) total,
    SUM(repurchase_rate IS NULL) AS no_rep,
    SUM(monthly_buyers IS NULL) AS no_buyers,
    SUM(is_super IS NULL) AS no_super,
    SUM(repurchase_rate IS NULL OR monthly_buyers IS NULL OR is_super IS NULL) AS any_gap
  FROM factories
  WHERE (is_trader IS NULL OR is_trader=0) AND dup_of IS NULL
    AND tier IN ('金标','银标','铜标')
  GROUP BY tier ORDER BY FIELD(tier,'金标','银标','铜标')
`) as any;
console.log("GAPS " + JSON.stringify(r));
process.exit(0);
