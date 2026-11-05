import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
const db = await getDb();
const [rows]: any = await db.execute(sql`
  SELECT f.id, f.name, s.quality_cert, s.factory_power, s.trust_years, f.images
  FROM factories f JOIN factory_scores s ON s.factory_id = f.id
  WHERE s.quality_cert = 25 AND s.factory_power = 65 AND s.trust_years = 85 LIMIT 5`);
for (const r of rows) {
  console.log("=== id", r.id, r.name);
  const img = typeof r.images === "string" ? JSON.parse(r.images) : r.images;
  if (!img) { console.log("  images: NULL"); continue; }
  for (const k of Object.keys(img)) {
    const arr = img[k];
    console.log(`  ${k}: ${Array.isArray(arr) ? arr.length : "?"} 条`, Array.isArray(arr) && arr[0] ? String(arr[0]).slice(0, 110) : "");
  }
}
process.exit(0);
