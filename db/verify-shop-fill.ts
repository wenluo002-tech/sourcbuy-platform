process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
const db = getDb();
const [rows]: any = await db.execute(sql`SELECT id,name,cert,cert_note,service_capability,employee_count,area_sqm,shopinfo_checked_at FROM factories WHERE id IN (22,25,38,73,74)`);
for (const f of rows) console.log(`[${f.id}] cert=${f.cert} | cert_note=${f.cert_note} | svc=${f.service_capability} | emp=${f.employee_count} | area=${f.area_sqm} | checked=${f.shopinfo_checked_at ? "✓" : "✗"}`);
process.exit(0);
