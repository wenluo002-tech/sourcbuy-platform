import { getDb } from "../api/queries/connection";
const db = await getDb();
import { sql } from "drizzle-orm";
const [r] = await db.execute(sql`
  SELECT
    COUNT(*) AS total_eligible,
    SUM(shopinfo_checked_at IS NOT NULL) AS checked,
    SUM(shopinfo_checked_at IS NULL) AS remaining
  FROM factories
  WHERE is_trader=0 AND dup_of IS NULL
    AND (member_id LIKE 'b2b-%' OR member_id REGEXP '^[a-z0-9_]{3,32}$')
`) as any;
console.log("PROGRESS " + JSON.stringify(r[0] ?? r));
const [c] = await db.execute(sql`
  SELECT
    SUM(home IS NOT NULL AND home<>'') AS home,
    SUM(production_type IS NOT NULL AND production_type<>'') AS ptype,
    SUM(oem_mode IS NOT NULL AND oem_mode<>'') AS oem,
    SUM(cert IS NOT NULL AND cert<>'') AS cert,
    SUM(employee_count IS NOT NULL AND employee_count>0) AS emp,
    SUM(area_sqm IS NOT NULL AND area_sqm>0) AS area
  FROM factories WHERE is_trader=0 AND dup_of IS NULL
`) as any;
console.log("COVERAGE " + JSON.stringify(c[0] ?? c));
const [l] = await db.execute(sql`
  SELECT COUNT(*) AS rows, ROUND(SUM(cost),2) AS spent
  FROM sourcing_ledger WHERE provider='wanbang' AND endpoint='item_get_shop+seller_info'
`) as any;
console.log("LEDGER " + JSON.stringify(l[0] ?? l));
process.exit(0);
