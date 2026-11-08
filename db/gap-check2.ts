import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
const db = getDb();
const [s]: any = await db.execute(sql`
  SELECT
    SUM(cert IS NULL OR cert = '') AS no_cert,
    SUM(service_capability IS NULL OR service_capability = '') AS no_svc,
    SUM(monthly_buyers IS NULL) AS no_buyers,
    SUM(employee_count IS NULL) AS no_staff,
    SUM(area_sqm IS NULL) AS no_area,
    SUM(repurchase_rate IS NULL) AS no_rebuy,
    SUM(is_super = 1) AS super_cnt,
    SUM(cards_checked_at IS NOT NULL) AS cards_done
  FROM factories
  WHERE (is_trader IS NULL OR is_trader = 0) AND dup_of IS NULL
`);
console.log(JSON.stringify(s[0], null, 2));
// 万邦费用台账累计
const [c]: any = await db.execute(sql`
  SELECT provider, COUNT(*) AS calls, SUM(cost) AS total_cost
  FROM sourcing_api_logs GROUP BY provider
`);
console.log(JSON.stringify(c, null, 2));
process.exit(0);
