/**
 * 雷达数据回填：出厂价带/销量从搜索缓存(或实时)取，严选厂数按人工审定类目统计
 * 运行：npx tsx db/backfill-radar.ts
 */
import { getDb } from "../api/queries/connection";
import { radarItems, factories, factoryCategories } from "./schema";
import { searchOffers } from "../api/sourcing/offerService";
import { sql, eq } from "drizzle-orm";

try { process.loadEnvFile(); } catch { /* noop */ }

// 人工审定的类目归属（按 factory_categories 的 17 类目口径）
const CATEGORY_MAP: Record<string, string> = {
  植绒衣架: "家居日用",
  穿戴甲: "美妆个护",
  一次性洗脸巾: "美妆个护",
  LED头灯: "户外运动",
  融蜡灯: "家居日用",
  宠物尿垫: "宠物用品",
  痘痘贴: "美妆个护",
  床品四件套: "家居日用",
  法兰绒毛毯: "家居日用",
  电动奶泡器: "厨房餐饮",
  防水床笠: "家居日用",
  暖宝宝: "家居日用",
  瑜伽垫: "户外运动",
  阻力带: "户外运动",
  卡膜: "文具办公",
  急救毯: "户外运动",
  宠物湿巾: "宠物用品",
  插排: "电子数码",
  加湿器: "电子数码",
  食品温度计: "厨房餐饮",
  圣诞灯: "工艺礼品",
  滑雪面罩: "服装服饰",
  无热卷发棒: "美妆个护",
  露营灯: "户外运动",
};

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
}

async function categoryVettedCount(category: string): Promise<number> {
  const db = getDb();
  const [rows]: any = await db.execute(
    sql`SELECT COUNT(*) AS c FROM factories f JOIN factory_categories fc ON fc.factory_id = f.id
        WHERE fc.category = ${category}`
  );
  return Number(rows[0]?.c ?? 0);
}

async function main() {
  const db = getDb();
  const rows = await db.select().from(radarItems).where(eq(radarItems.active, true));
  console.log(`回填 ${rows.length} 条…`);
  for (const row of rows) {
    let pMin: string | null = null, pMax: string | null = null, topSales: number | null = null, upstream: number | null = row.upstreamCount;
    let imageUrl: string | null = null;
    try {
      const r = await searchOffers(row.keyword, 1);
      upstream = r.total ?? upstream;
      const prices = r.items.map((p) => p.promotionPrice ?? p.price).filter((n) => n > 0);
      if (prices.length) {
        const med = median(prices);
        const sane = prices.filter((p) => p >= med * 0.15 && p <= med * 8);
        const use = sane.length >= 2 ? sane : prices;
        pMin = (Math.round(Math.min(...use) * 100) / 100).toFixed(2);
        pMax = (Math.round(Math.max(...use) * 100) / 100).toFixed(2);
      }
      const sales = r.items.map((p) => p.sales).filter((n) => n > 0);
      if (sales.length) topSales = Math.max(...sales);
      // 产品代表图：取第一条有图的上游商品首图（不编图，没图就留空）
      imageUrl = r.items.find((p) => p.image)?.image ?? null;
    } catch (e: any) {
      console.log(`  [货源查询失败保留原值] ${row.title}: ${String(e?.message ?? e).slice(0, 80)}`);
    }
    const cat = CATEGORY_MAP[row.keyword];
    const vetted = cat ? await categoryVettedCount(cat) : 0;
    await db
      .update(radarItems)
      .set({ factoryPriceMin: pMin, factoryPriceMax: pMax, topSales, upstreamCount: upstream, vettedCount: vetted, ...(imageUrl ? { imageUrl } : {}) })
      .where(eq(radarItems.id, row.id));
    console.log(`  ✓ ${row.title} | ${cat ?? "∅"} 严选 ${vetted} | 出厂 ¥${pMin ?? "?"}-${pMax ?? "?"} | 销 ${topSales ?? "?"} | 图 ${imageUrl ? "✓" : "∅"}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
