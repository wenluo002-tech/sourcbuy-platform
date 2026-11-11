import { sql } from "drizzle-orm";
import { getDb } from "../api/queries/connection";
const d = getDb();
const r = await d.execute(sql`SELECT DISTINCT tier FROM factories`);
console.log("tier 枚举:", JSON.stringify((r as any)[0].map((x: any) => x.tier)));
process.exit(0);
