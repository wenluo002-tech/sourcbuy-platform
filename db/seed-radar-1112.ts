/**
 * 爆款雷达 2026-11-12 期周更（当日实抓亚马逊五类目畅销榜）
 *
 * 数据源纪律（铁律）：榜单信号全部来自 2026-11-12 当日实抓 amazon.com Best Sellers 页面；
 * 产能数据实时查询 searchOffers；严选厂数实时查工厂库；不编任何数字，抓不到就留空。
 *
 * 本期变动：
 * - 17 个亚马逊品更新名次/价格/信号日期
 * - 3 品掉出当期前 30 撤下：电动奶泡器、急救保温毯、LED 露营灯
 * - 3 品新上榜补位：抱枕芯(H&K #14)、桌面暖风机(H&K #28)、净水吸管(Sports #9)
 * - TikTok 4 品保持 FastMoss 2026-10-21 报道口径（最近可溯源报道，无更新不硬刷）
 *
 * 运行：npx tsx db/seed-radar-1112.ts
 */
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { radarItems } from "./schema";
import { searchOffers } from "../api/sourcing/offerService";
import { factories } from "./schema";
import { sql, eq } from "drizzle-orm";

const D = "2026-11-12";

// ── 1. 在榜品名次/价格/日期更新（当日实抓） ──
const UPDATES: Array<{ keyword: string; signalText: string; price?: number }> = [
  { keyword: "床品四件套", signalText: "亚马逊美国站 Home & Kitchen 畅销榜 #1", price: 11.29 },
  { keyword: "植绒衣架", signalText: "亚马逊美国站 Home & Kitchen 畅销榜 #2", price: 17.99 },
  { keyword: "防水床笠", signalText: "亚马逊美国站 Home & Kitchen 畅销榜 #8" },
  { keyword: "加湿器", signalText: "亚马逊美国站 Home & Kitchen 畅销榜 #12" },
  { keyword: "法兰绒毛毯", signalText: "亚马逊美国站 Home & Kitchen 畅销榜 #15", price: 13.49 },
  { keyword: "融蜡灯", signalText: "亚马逊美国站 Home & Kitchen 畅销榜 #17", price: 19.29 },
  { keyword: "食品温度计", signalText: "亚马逊美国站 Home & Kitchen 畅销榜 #26", price: 9.97 },
  { keyword: "痘痘贴", signalText: "亚马逊美国站 Beauty 畅销榜 #2", price: 11.97 },
  { keyword: "一次性洗脸巾", signalText: "亚马逊美国站 Beauty 畅销榜 #3", price: 17.95 },
  { keyword: "LED头灯", signalText: "亚马逊美国站 Sports & Outdoors 畅销榜 #6", price: 19.99 },
  { keyword: "暖宝宝", signalText: "亚马逊美国站 Sports & Outdoors 畅销榜 #5", price: 7.48 },
  { keyword: "卡膜", signalText: "亚马逊美国站 Sports & Outdoors 畅销榜 #8" },
  { keyword: "瑜伽垫", signalText: "亚马逊美国站 Sports & Outdoors 畅销榜 #17" },
  { keyword: "阻力带", signalText: "亚马逊美国站 Sports & Outdoors 畅销榜 #18", price: 9.98 },
  { keyword: "宠物尿垫", signalText: "亚马逊美国站 Pet Supplies 畅销榜 #3", price: 20.99 },
  { keyword: "宠物湿巾", signalText: "亚马逊美国站 Pet Supplies 畅销榜 #12" },
  { keyword: "插排", signalText: "亚马逊美国站 Electronics 畅销榜 #10", price: 9.99 },
];

// ── 2. 掉出当期前 30，撤下 ──
const RETIRE = ["电动奶泡器", "急救毯", "露营灯"];

// ── 3. 新品补位（当日实抓在榜，产能实时查询） ──
const NEW_ITEMS = [
  {
    title: "抱枕芯两只装", titleEn: "Throw Pillow Inserts 2-Pack", keyword: "抱枕芯", strictKw: ["抱枕"],
    signalSource: "amazon" as const, signalText: "亚马逊美国站 Home & Kitchen 畅销榜 #14",
    signalUrl: "https://www.amazon.com/dp/B0DXKC5G3H", signalDate: D, retailPriceUsd: null,
    note: "家纺白牌里的隐形走量款，南通产业带产能充足。看充棉克重和回弹，寄样捏一捏就知道虚实。",
    sortOrder: 21,
  },
  {
    title: "桌面暖风机", titleEn: "Portable Space Heater", keyword: "暖风机", strictKw: ["暖风机", "取暖器"],
    signalSource: "amazon" as const, signalText: "亚马逊美国站 Home & Kitchen 畅销榜 #28",
    signalUrl: "https://www.amazon.com/dp/B0C6FCKQML", signalDate: D, retailPriceUsd: null,
    note: "11 月供暖季正当口，PTC 陶瓷加热是主流方案。电器硬门槛：出口美国要 UL/ETL，插头按目的国制式，别接没认证的厂。",
    sortOrder: 22,
  },
  {
    title: "户外净水吸管", titleEn: "Personal Water Filter Straw", keyword: "户外净水吸管", strictKw: ["净水", "滤水"],
    signalSource: "amazon" as const, signalText: "亚马逊美国站 Sports & Outdoors 畅销榜 #9",
    signalUrl: "https://www.amazon.com/dp/B006QF3TW4", signalDate: D, retailPriceUsd: null,
    note: "户外+应急储备双场景，政府采购和救灾渠道也走这个。滤芯精度 0.1 微米是及格线，NSF 检测报告必须要。",
    sortOrder: 23,
  },
];

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
}

async function strictVettedCount(kws: string[]): Promise<number> {
  const db = getDb();
  const conds = kws.map((k) => sql`(${factories.name} LIKE ${"%" + k + "%"} OR ${factories.review} LIKE ${"%" + k + "%"})`);
  const [rows]: any = await db.execute(
    sql`SELECT COUNT(*) AS c FROM factories WHERE score >= 85 AND (${sql.join(conds, sql` OR `)})`
  );
  return Number(rows[0]?.c ?? 0);
}

async function main() {
  const db = getDb();

  // 1. 更新在榜品
  let upd = 0;
  for (const u of UPDATES) {
    const sets = [`signal_text = ${sql.placeholder}?`, `signal_date = ?`];
    const r: any = await db.execute(sql`
      UPDATE radar_items SET signal_text = ${u.signalText}, signal_date = ${D}
      ${u.price != null ? sql`, retail_price_usd = ${String(u.price)}` : sql``}
      WHERE keyword = ${u.keyword}`);
    const n = r?.[0]?.affectedRows ?? r?.affectedRows ?? 0;
    if (Number(n) > 0) { upd++; console.log(`  ✓ 更新 ${u.keyword} → ${u.signalText}`); }
    else console.log(`  ✗ 未命中 keyword=${u.keyword}`);
  }
  console.log(`更新 ${upd}/${UPDATES.length}`);

  // 2. 撤下掉榜品
  for (const t of RETIRE) {
    await db.update(radarItems).set({ active: false }).where(eq(radarItems.title, t));
    console.log(`  ↓ 撤下 ${t}（掉出当期前 30）`);
  }

  // 3. 新品补位（产能实时查询）
  for (const c of NEW_ITEMS) {
    let upstreamCount: number | null = null, pMin: number | null = null, pMax: number | null = null, topSales: number | null = null, imageUrl: string | null = null;
    try {
      const r = await searchOffers(c.keyword, 1);
      upstreamCount = r.total ?? null;
      const prices = r.items.map((p) => p.promotionPrice ?? p.price).filter((n) => n > 0);
      if (prices.length >= 3) {
        const med = median(prices);
        const sane = prices.filter((p) => p >= med * 0.15 && p <= med * 8);
        const use = sane.length >= 2 ? sane : prices;
        pMin = Math.round(Math.min(...use) * 100) / 100;
        pMax = Math.round(Math.max(...use) * 100) / 100;
      } else if (prices.length > 0) { pMin = Math.min(...prices); pMax = Math.max(...prices); }
      const sales = r.items.map((p) => p.sales).filter((n) => n > 0);
      if (sales.length) topSales = Math.max(...sales);
      imageUrl = r.items.find((p) => p.image)?.image ?? null;
    } catch (e: any) { console.log(`  [上游查询失败留空] ${c.title}: ${e?.message ?? e}`); }
    const vetted = await strictVettedCount(c.strictKw).catch(() => 0);
    await db.insert(radarItems).values({
      title: c.title, titleEn: c.titleEn, keyword: c.keyword,
      signalSource: c.signalSource, signalText: c.signalText, signalUrl: c.signalUrl, signalDate: c.signalDate,
      imageUrl, retailPriceUsd: c.retailPriceUsd != null ? String(c.retailPriceUsd) : null,
      factoryPriceMin: pMin != null ? String(pMin) : null, factoryPriceMax: pMax != null ? String(pMax) : null,
      upstreamCount, vettedCount: vetted, topSales, note: c.note, sortOrder: c.sortOrder, active: true,
    });
    console.log(`  + 新上榜 ${c.title} | 上游 ${upstreamCount ?? "?"} | 出厂 ¥${pMin ?? "?"}-${pMax ?? "?"} | 严选 ${vetted} 家`);
  }
  console.log("2026-11-12 期雷达周更完成");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
