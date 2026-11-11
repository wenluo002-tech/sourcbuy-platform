// 摸底：legacy 库里「液晶电视」标题总量、整机粗估量；并看 30 条样本
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { legacyProducts } from "@db/schema";
import { sql as dsql } from "drizzle-orm";

const db = getDb();
const cnt = await db.execute(dsql`SELECT COUNT(*) AS c FROM legacy_products WHERE title LIKE '%液晶电视%'`);
console.log("title LIKE %液晶电视% 总数:", (cnt as any)[0]?.[0]?.c ?? cnt);
const whole = await db.execute(dsql`
  SELECT COUNT(*) AS c FROM legacy_products
  WHERE title LIKE '%液晶电视%'
    AND title NOT LIKE '%罩%' AND title NOT LIKE '%套%' AND title NOT LIKE '%线%'
    AND title NOT LIKE '%连接器%' AND title NOT LIKE '%喇叭%' AND title NOT LIKE '%扬声器%'
    AND title NOT LIKE '%支架%' AND title NOT LIKE '%挂架%' AND title NOT LIKE '%遥控%'
    AND title NOT LIKE '%主板%' AND title NOT LIKE '%灯条%' AND title NOT LIKE '%背光%'
    AND title NOT LIKE '%配件%' AND title NOT LIKE '%维修%' AND title NOT LIKE '%拆机%'
`);
console.log("粗剔配件词后剩余:", (whole as any)[0]?.[0]?.c ?? whole);
const rows = await db
  .select({ title: legacyProducts.title, price: legacyProducts.priceCny })
  .from(legacyProducts)
  .where(dsql`title LIKE '%液晶电视%' AND title NOT LIKE '%罩%' AND title NOT LIKE '%套%' AND title NOT LIKE '%线%' AND title NOT LIKE '%连接器%' AND title NOT LIKE '%喇叭%' AND title NOT LIKE '%扬声器%' AND title NOT LIKE '%支架%' AND title NOT LIKE '%遥控%' AND title NOT LIKE '%主板%' AND title NOT LIKE '%配件%' AND title NOT LIKE '%维修%'`)
  .limit(15);
for (const r of rows) console.log("整机样本:", r.title.slice(0, 50), "| ¥" + r.price);
process.exit(0);
