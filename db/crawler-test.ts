process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
async function main() {
  const db = getDb();
  const [rows] = await db.execute(sql`
    SELECT p.offer_id, p.seller_user_id, f.id AS fid, f.name, f.member_id
    FROM offer_pool p JOIN factories f ON f.seller_user_id = p.seller_user_id
    WHERE f.is_trader=0 LIMIT 3`) as any;
  for (const r of rows as any[]) {
    const url = `https://dm.sunclub.top:1129/***REMOVED***/api/alibabaformat/offER?OFFERID=${r.offer_id}`;
    const t0 = Date.now();
    try {
      const resp = await fetch(url);
      const d = await resp.json() as any;
      const ok = d?.Success === true;
      const shop = d?.Data?.ShopName, uid = d?.Data?.UserId, cat = d?.Data?.CategoryName;
      console.log(JSON.stringify({
        offerId: r.offer_id, ok, ms: Date.now()-t0,
        库内厂名: r.name, 接口ShopName: shop,
        memberId匹配: uid === r.member_id, cat
      }));
    } catch (e: any) { console.log(r.offer_id, "失败", e.message); }
  }
  process.exit(0);
}
main();
