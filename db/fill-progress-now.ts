process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
const db = await getDb();
const [r]: any = await db.execute(sql`SELECT COUNT(*) checked FROM factories WHERE shopinfo_checked_at IS NOT NULL`);
const [g]: any = await db.execute(sql`SELECT COUNT(*) remaining FROM factories WHERE (is_trader IS NULL OR is_trader=0) AND dup_of IS NULL AND shopinfo_checked_at IS NULL AND (member_id LIKE 'b2b-%' OR member_id REGEXP '^[a-z0-9_]{3,32}$') AND (home IS NULL OR home='' OR production_type IS NULL OR oem_mode IS NULL OR cert IS NULL OR cert='' OR employee_count IS NULL OR employee_count=0 OR area_sqm IS NULL OR area_sqm=0)`);
console.log(`已处理 ${r[0].checked}，剩余 ${g[0].remaining}`);
process.exit(0);
