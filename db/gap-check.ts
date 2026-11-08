import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";

const db = getDb();
const [r]: any = await db.execute(sql`
  SELECT
    COUNT(*) AS total,
    SUM(home IS NULL OR home = '') AS no_home,
    SUM(oem_mode IS NULL OR oem_mode = '') AS no_oem,
    SUM(production_type IS NULL OR production_type = '') AS no_ptype,
    SUM(seller_user_id IS NULL OR seller_user_id = '') AS no_uid,
    SUM(years IS NULL) AS no_years,
    SUM(images IS NULL OR images = '' OR images = '[]') AS no_images,
    SUM(score IS NULL) AS no_score,
    SUM(review IS NULL OR review = '' OR review = '工厂档案补全中。') AS no_review,
    SUM(tags LIKE '%wbpilot_v1%') AS pilot_new
  FROM factories
  WHERE (is_trader IS NULL OR is_trader = 0) AND dup_of IS NULL
`);
console.log("=== 前台口径(非贸易商/非重复)缺口 ===");
console.log(JSON.stringify(r[0], null, 2));

const [s]: any = await db.execute(sql`
  SELECT
    SUM(cert IS NULL OR cert = '') AS no_cert,
    SUM(service_capability IS NULL OR service_capability = '') AS no_svc,
    SUM(monthly_buyers IS NULL) AS no_buyers,
    SUM(staff_count IS NULL) AS no_staff,
    SUM(workshop_area IS NULL) AS no_area,
    SUM(repeat_purchase_rate IS NULL) AS no_rebuy
  FROM factories
  WHERE (is_trader IS NULL OR is_trader = 0) AND dup_of IS NULL
`).catch((e: any) => { console.log("deep fields err:", e.message?.slice(0, 200)); return [[null]]; });
if (s?.[0]) { console.log("=== 深度档案字段缺口 ==="); console.log(JSON.stringify(s[0], null, 2)); }
process.exit(0);
