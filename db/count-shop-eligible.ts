process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
const db = getDb();
const [r]: any = await db.execute(sql`
  SELECT COUNT(*) AS c FROM factories
  WHERE (is_trader IS NULL OR is_trader = 0) AND dup_of IS NULL AND shopinfo_checked_at IS NULL
    AND member_id IS NOT NULL AND member_id <> ''
    AND (member_id LIKE 'b2b-%' OR member_id REGEXP '^[a-z0-9_]{3,32}$')
    AND (home IS NULL OR home='' OR production_type IS NULL OR oem_mode IS NULL
         OR cert IS NULL OR cert='' OR employee_count IS NULL OR employee_count=0
         OR area_sqm IS NULL OR area_sqm=0)
`);
console.log("可回填厂数:", r[0].c);
process.exit(0);
