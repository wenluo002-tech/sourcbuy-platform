import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
const db = await getDb();
const [rows]: any = await db.execute(sql`SELECT images FROM factories WHERE images IS NOT NULL`);
let rel = 0, abs = 0, mixed = 0, empty = 0, totalImgs = 0;
for (const r of rows) {
  const img = typeof r.images === "string" ? JSON.parse(r.images) : r.images;
  let hasRel = false, hasAbs = false, count = 0;
  for (const k of Object.keys(img)) for (const u of img[k] ?? []) {
    count++;
    if (/^https?:\/\//i.test(u)) hasAbs = true; else hasRel = true;
  }
  totalImgs += count;
  if (hasRel && hasAbs) mixed++; else if (hasRel) rel++; else if (hasAbs) abs++; else empty++;
}
console.log(`有 images 的厂: ${rows.length} | 纯相对路径: ${rel} | 纯绝对URL: ${abs} | 混合: ${mixed} | 空: ${empty} | 图片总数: ${totalImgs}`);
process.exit(0);
