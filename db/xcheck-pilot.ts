// 三源交叉印证试点：同一批商品同时走 sunclub（罗总爬虫）与万邦 item_get_app，
// 比对 卖家身份 / 价格 / 重量 三个硬字段的一致率，给数据质量一个量化口径。
// 万邦侧每次 ¥0.05，N=30 共 ¥1.5。
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
import { wbGetOfferApp } from "../api/sourcing/wanbang";

const BASE = process.env.SUNCLUB_BASE!;
const N = Number(process.env.PILOT || 30);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const db = getDb();
  const [rows] = (await db.execute(sql`
    SELECT offer_id, title, price, seller_user_id FROM offer_pool
    WHERE cat_path IS NOT NULL ORDER BY RAND() LIMIT ${N}`)) as any;
  let sellerOk = 0, priceOk = 0, priceBoth = 0, weightBoth = 0, done = 0;
  const notes: string[] = [];
  for (const r of rows as any[]) {
    try {
      const sc = await (await fetch(`${BASE}/api/alibabaformat/offER?OFFERID=${r.offer_id}`, { signal: AbortSignal.timeout(15000) })).json() as any;
      const wb = await wbGetOfferApp(String(r.offer_id));
      if (sc?.Success !== true || !wb.offer) { notes.push(`${r.offer_id} 有一源取不到`); continue; }
      done++;
      // 1) 卖家身份：sunclub UserId vs 万邦 memberId / 池内 userId 前缀
      const scUid: string | null = sc.Data.UserId ?? null;
      const wbMember: string | null = wb.offer.memberId ?? null;
      const poolUid: string | null = r.seller_user_id;
      const scUidNum = scUid?.replace(/^b2b-/, "").match(/^\d+/)?.[0] ?? null;
      if (scUidNum && poolUid && scUidNum === poolUid) sellerOk++;
      else if (scUid && wbMember === scUid) sellerOk++;
      else notes.push(`${r.offer_id} 卖家身份不一致: sc=${scUid} wb=${wbMember} pool=${poolUid}`);
      // 2) 价格：sunclub 阶梯首档 vs 万邦首档，相差 ≤10% 视为一致
      const scPrice = Number(sc.Data.PriceRangeInfos?.[0]?.Price ?? 0);
      const wbPrice = wb.offer.priceMin != null ? Number(wb.offer.priceMin) : null;
      if (scPrice > 0 && wbPrice != null && wbPrice > 0) {
        priceBoth++;
        if (Math.abs(scPrice - wbPrice) / Math.max(scPrice, wbPrice) <= 0.1) priceOk++;
        else notes.push(`${r.offer_id} 价格差异大: sunclub=${scPrice} 万邦=${wbPrice}`);
      }
      // 3) 重量：sunclub SKU 中位 vs 万邦交叉算法重量（0.02–60kg 带）
      const ws = (sc.Data.Tags?.pieceWeightScale?.pieceWeightScaleInfo ?? []).map((x: any) => Number(x.weight)).filter((w: number) => w > 0).sort((a: number, b: number) => a - b);
      const scW = ws.length ? ws[Math.floor(ws.length / 2)] / 1000 : null; // 克→公斤
      const wbW = (wb.offer as any).unitWeightKg ?? null;
      if (scW && wbW) {
        weightBoth++;
        if (Math.abs(scW - wbW) / Math.max(scW, wbW) > 0.35) notes.push(`${r.offer_id} 重量分歧: sunclub=${scW}kg 万邦=${wbW}kg`);
      }
    } catch (e: any) { notes.push(`${r.offer_id} 异常 ${e.message?.slice(0, 60)}`); }
    await sleep(400);
  }
  console.log(JSON.stringify({ 样本: (rows as any[]).length, 双源都取到: done, 卖家身份一致: sellerOk, 价格可比对: priceBoth, 价格一致: priceOk, 重量可比对: weightBoth }, null, 1));
  for (const n of notes) console.log(" !", n);
  process.exit(0);
}
main();
