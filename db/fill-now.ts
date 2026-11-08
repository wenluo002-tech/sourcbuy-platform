import { getDb } from "../api/queries/connection";
import { sql as dsql } from "drizzle-orm";
const db: any = getDb();
const [r]: any = await db.execute(dsql`SELECT COUNT(*) total, SUM(CASE WHEN shopinfo_checked_at IS NOT NULL THEN 1 ELSE 0 END) done FROM factories WHERE (is_trader IS NULL OR is_trader=0) AND dup_of IS NULL AND member_id IS NOT NULL AND member_id <> '' AND (member_id LIKE 'b2b-%' OR member_id REGEXP '^[a-z0-9_]{3,32}$')`);
const [cov]: any = await db.execute(dsql`SELECT SUM(employee_count IS NOT NULL AND employee_count>0) emp, SUM(area_sqm IS NOT NULL AND area_sqm>0) area, SUM(cert IS NOT NULL AND cert<>'') cert, SUM(oem_mode IS NOT NULL AND oem_mode<>'') oem, SUM(production_type IS NOT NULL AND production_type<>'') ptype, SUM(home IS NOT NULL AND home<>'') home, COUNT(*) total FROM factories WHERE (is_trader IS NULL OR is_trader=0) AND dup_of IS NULL`);
const [cost]: any = await db.execute(dsql`SELECT COALESCE(SUM(cost_cny),0) s FROM sourcing_api_logs WHERE provider='wanbang' AND DATE(created_at)=CURDATE()`);
console.log(JSON.stringify({ backfill: r[0], coverage: cov[0], todayCost: cost[0].s }));
process.exit(0);
