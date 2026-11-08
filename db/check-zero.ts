process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
const db = getDb();
const [r]: any = await db.execute(sql`
  SELECT
    SUM(employee_count IS NULL) AS emp_null, SUM(employee_count = 0) AS emp_zero,
    SUM(area_sqm IS NULL) AS area_null, SUM(area_sqm = 0) AS area_zero,
    SUM((employee_count IS NULL OR employee_count = 0)) AS emp_missing,
    SUM((area_sqm IS NULL OR area_sqm = 0)) AS area_missing
  FROM factories WHERE (is_trader IS NULL OR is_trader = 0) AND dup_of IS NULL
`);
console.log(JSON.stringify(r[0]));
process.exit(0);
