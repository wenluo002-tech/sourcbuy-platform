/**
 * 爆款雷达数据编选脚本（运营周更用）
 *
 * 数据源纪律（铁律）：
 * - 海外信号必须真实：亚马逊榜单来自当日实抓（scripts 外的人工/脚本抓取），
 *   TikTok 信号来自可溯源的公开报道/榜单，一律带来源与日期
 * - 产能数据实时查询：上游货源数/出厂价带来自 searchOffers，严选厂数来自工厂库
 * - 不编任何数字；查不到就留空，话术里说真话
 *
 * 运行：npx tsx db/seed-radar.ts
 */
import { getDb } from "../api/queries/connection";
import { radarItems } from "./schema";
import { searchOffers } from "../api/sourcing/offerService";
import { factories } from "./schema";
import { sql } from "drizzle-orm";

if (!process.env.ALIBABA_AGG_TOKEN) {
  try { process.loadEnvFile(); } catch { /* noop */ }
}

interface Candidate {
  title: string;
  titleEn: string;
  keyword: string; // 上游搜货词
  strictKw: string[]; // 严选库对口判定词（name/review LIKE）
  signalSource: "amazon" | "tiktok";
  signalText: string;
  signalUrl: string;
  signalDate: string;
  retailPriceUsd: number | null;
  note: string; // 老采购点评
  sortOrder: number;
}

// ---- 2026-11-04 期：亚马逊 5 类目畅销榜实抓 + TikTok 公开报道 ----
const CANDIDATES: Candidate[] = [
  {
    title: "植绒防滑衣架", titleEn: "Velvet Non-Slip Hangers", keyword: "植绒衣架", strictKw: ["衣架"],
    signalSource: "amazon", signalText: "亚马逊美国站 Home & Kitchen 畅销榜 #1",
    signalUrl: "https://www.amazon.com/dp/B00FXNAAW2", signalDate: "2026-11-04", retailPriceUsd: 16.99,
    note: "美国家庭收纳常年刚需，榜一首位不是一天两天了。货轻但抛货，走海运拼体积，量大再谈。",
    sortOrder: 1,
  },
  {
    title: "手工穿戴甲", titleEn: "Handmade Press-on Nails", keyword: "穿戴甲", strictKw: ["穿戴甲", "美甲"],
    signalSource: "tiktok", signalText: "TikTok 美区新品周销 5,113 件，GMV $44.5万（FastMoss 报道，截至 2026-10-21）",
    signalUrl: "https://www.fastmoss.com/blog/how-to-find-trending-products-tiktok-shop/", signalDate: "2026-10-21", retailPriceUsd: null,
    note: "TikTok 美甲内容带起来的品类，手工款溢价高。注意胶水合规（FDA 化妆品类目），别碰侵权图案。",
    sortOrder: 2,
  },
  {
    title: "一次性洗脸巾", titleEn: "Disposable Face Towels", keyword: "一次性洗脸巾", strictKw: ["洗脸巾", "洁面巾"],
    signalSource: "amazon", signalText: "亚马逊美国站 Beauty 畅销榜 #3",
    signalUrl: "https://www.amazon.com/dp/B07PBXXNCY", signalDate: "2026-11-04", retailPriceUsd: 17.95,
    note: "复购型耗材，榜单常客。无纺布克重和纹路是卖点，寄样时重点摸厚度。",
    sortOrder: 3,
  },
  {
    title: "LED 充电头灯", titleEn: "Rechargeable LED Headlamp", keyword: "LED头灯", strictKw: ["头灯"],
    signalSource: "amazon", signalText: "亚马逊美国站 Sports & Outdoors 畅销榜 #3",
    signalUrl: "https://www.amazon.com/dp/B08P2KGDJJ", signalDate: "2026-11-04", retailPriceUsd: 19.99,
    note: "秋冬户外+应急双场景，Q4 正是旺季。带电池走货要 UN38.3 认证，出货前确认。",
    sortOrder: 4,
  },
  {
    title: "融蜡灯", titleEn: "Candle Warmer Lamp", keyword: "融蜡灯", strictKw: ["融蜡灯", "香薰灯"],
    signalSource: "amazon", signalText: "亚马逊美国站 Home & Kitchen 畅销榜 #28",
    signalUrl: "https://www.amazon.com/dp/B0CT2HVMQP", signalDate: "2026-11-04", retailPriceUsd: 15.09,
    note: "TikTok 家居内容常客，送礼属性强。电器类目要 UL/ETL 认证，插头按目的国制式来。",
    sortOrder: 5,
  },
  {
    title: "宠物尿垫", titleEn: "Dog Pee Pads", keyword: "宠物尿垫", strictKw: ["宠物尿垫", "尿垫"],
    signalSource: "amazon", signalText: "亚马逊美国站 Pet Supplies 畅销榜 #2",
    signalUrl: "https://www.amazon.com/dp/B00MW8G62E", signalDate: "2026-11-04", retailPriceUsd: 20.99,
    note: "重货耗材，走海运才划算。复购率极高，适合做长期供货关系，别指望一单吃胖。",
    sortOrder: 6,
  },
  {
    title: "痘痘贴", titleEn: "Acne Pimple Patches", keyword: "痘痘贴", strictKw: ["痘痘贴", "痘贴"],
    signalSource: "amazon", signalText: "亚马逊美国站 Beauty 畅销榜 #2",
    signalUrl: "https://www.amazon.com/dp/B074PVTPBW", signalDate: "2026-11-04", retailPriceUsd: 11.97,
    note: "水胶体材质，轻小高毛利，空运友好。出口美国按化妆品/一类医疗器械边界走，成分表要干净。",
    sortOrder: 7,
  },
  {
    title: "超细纤维床品四件套", titleEn: "Microfiber Bed Sheet Set", keyword: "床品四件套", strictKw: ["四件套", "床品"],
    signalSource: "amazon", signalText: "亚马逊美国站 Home & Kitchen 畅销榜 #4",
    signalUrl: "https://www.amazon.com/dp/B00Q7OAW1U", signalDate: "2026-11-04", retailPriceUsd: 21.22,
    note: "南通产业带的看家品类，工厂一抓一大把。报价差异在纱支密度，先锁规格再比价。",
    sortOrder: 8,
  },
  {
    title: "法兰绒毛毯", titleEn: "Fleece Throw Blanket", keyword: "法兰绒毛毯", strictKw: ["毛毯", "绒毯"],
    signalSource: "amazon", signalText: "亚马逊美国站 Home & Kitchen 畅销榜 #13",
    signalUrl: "https://www.amazon.com/dp/B07ZQP9ZML", signalDate: "2026-11-04", retailPriceUsd: 13.49,
    note: "Q4 送礼+居家双需求，秋季榜单稳定上行。抛货，压缩包装能省一方是一方。",
    sortOrder: 9,
  },
  {
    title: "电动奶泡器", titleEn: "Electric Milk Frother", keyword: "电动奶泡器", strictKw: ["奶泡器", "奶泡机"],
    signalSource: "amazon", signalText: "亚马逊美国站 Home & Kitchen 畅销榜 #29",
    signalUrl: "https://www.amazon.com/dp/B09C2HL4YK", signalDate: "2026-11-04", retailPriceUsd: 11.89,
    note: "厨房小电器里最好做的款之一，#KitchenTok 常年有内容。充电款比电池款好卖。",
    sortOrder: 10,
  },
  {
    title: "防水床垫保护罩", titleEn: "Waterproof Mattress Protector", keyword: "防水床笠", strictKw: ["床笠", "床垫保护"],
    signalSource: "amazon", signalText: "亚马逊美国站 Home & Kitchen 畅销榜 #8",
    signalUrl: "https://www.amazon.com/dp/B074H66N6B", signalDate: "2026-11-04", retailPriceUsd: 28.04,
    note: "美国家庭+酒店双客群。TPU 覆膜工艺是关键，验厂时看涂层车间。",
    sortOrder: 11,
  },
  {
    title: "暖宝宝贴", titleEn: "Hand & Body Warmers", keyword: "暖宝宝", strictKw: ["暖宝宝", "暖贴"],
    signalSource: "amazon", signalText: "亚马逊美国站 Sports & Outdoors 畅销榜 #9",
    signalUrl: "https://www.amazon.com/dp/B00OJDO6QC", signalDate: "2026-11-04", retailPriceUsd: 26.99,
    note: "11 月正是起量的时候，季节品生命周期到 2 月。发热时长和温控是差评重灾区，寄样先自测。",
    sortOrder: 12,
  },
  {
    title: "加厚瑜伽垫", titleEn: "Thick Yoga Mat", keyword: "瑜伽垫", strictKw: ["瑜伽垫"],
    signalSource: "amazon", signalText: "亚马逊美国站 Sports & Outdoors 畅销榜 #22",
    signalUrl: "https://www.amazon.com/dp/B01LP0U5X0", signalDate: "2026-11-04", retailPriceUsd: 23.08,
    note: "常青品类，NBR 材质走量、TPE 走价。欧美对甲酰胺有限量要求，让工厂出检测报告。",
    sortOrder: 13,
  },
  {
    title: "阻力带五件套", titleEn: "Resistance Loop Bands Set", keyword: "阻力带", strictKw: ["阻力带", "拉力带", "弹力带"],
    signalSource: "amazon", signalText: "亚马逊美国站 Sports & Outdoors 畅销榜 #23",
    signalUrl: "https://www.amazon.com/dp/B01AVDVHTI", signalDate: "2026-11-04", retailPriceUsd: 9.98,
    note: "1 月新年健身季前的备货窗口就是现在。乳胶过敏问题用 TPE 款规避。",
    sortOrder: 14,
  },
  {
    title: "卡牌保护套", titleEn: "Trading Card Sleeves", keyword: "卡膜", strictKw: ["卡膜", "卡套"],
    signalSource: "amazon", signalText: "亚马逊美国站 Sports & Outdoors 畅销榜 #10",
    signalUrl: "https://www.amazon.com/dp/B0C5XW36SP", signalDate: "2026-11-04", retailPriceUsd: 13.99,
    note: "TCG 卡牌热潮带动的小件耗材，轻、复购高。尺寸精度要求苛刻，公差超 0.5mm 就会被投诉。",
    sortOrder: 15,
  },
  {
    title: "急救保温毯", titleEn: "Emergency Thermal Blanket", keyword: "急救毯", strictKw: ["急救毯", "保温毯"],
    signalSource: "amazon", signalText: "亚马逊美国站 Sports & Outdoors 畅销榜 #8",
    signalUrl: "https://www.amazon.com/dp/B01M0LRWMT", signalDate: "2026-11-04", retailPriceUsd: 12.49,
    note: "应急储备类常年有单，政府采购渠道也走这个。镀铝膜厚度 12μm 是及格线。",
    sortOrder: 16,
  },
  {
    title: "宠物湿巾", titleEn: "Pet Grooming Wipes", keyword: "宠物湿巾", strictKw: ["宠物湿巾", "湿巾"],
    signalSource: "amazon", signalText: "亚马逊美国站 Pet Supplies 畅销榜 #15",
    signalUrl: "https://www.amazon.com/dp/B09BVKD5LT", signalDate: "2026-11-04", retailPriceUsd: 9.99,
    note: "宠物经济复购耗材。无酒精无香精是美区基本要求，成分表提前要。",
    sortOrder: 17,
  },
  {
    title: "浪涌保护插排", titleEn: "Surge Protector Power Strip", keyword: "插排", strictKw: ["插排", "插座", "排插"],
    signalSource: "amazon", signalText: "亚马逊美国站 Electronics 畅销榜 #11",
    signalUrl: "https://www.amazon.com/dp/B0DKM996CQ", signalDate: "2026-11-04", retailPriceUsd: 11.99,
    note: "美规插排必须 UL 认证，这是硬门槛——没有 UL 的厂报价再低也别碰，清关和保险都过不去。",
    sortOrder: 18,
  },
  {
    title: "上加水加湿器", titleEn: "Top Fill Humidifier", keyword: "加湿器", strictKw: ["加湿器"],
    signalSource: "amazon", signalText: "亚马逊美国站 Home & Kitchen 畅销榜 #12",
    signalUrl: "https://www.amazon.com/dp/B0C2V7YNTL", signalDate: "2026-11-04", retailPriceUsd: 23.71,
    note: "北美供暖季刚需，11 月到次年 2 月是销售窗口。上加水结构是现在的主流卖点。",
    sortOrder: 19,
  },
  {
    title: "烤肉温度计", titleEn: "Instant Read Meat Thermometer", keyword: "食品温度计", strictKw: ["温度计"],
    signalSource: "amazon", signalText: "亚马逊美国站 Home & Kitchen 畅销榜 #27",
    signalUrl: "https://www.amazon.com/dp/B07L5RV6FP", signalDate: "2026-11-04", retailPriceUsd: 9.97,
    note: "感恩节+圣诞烤肉季正当口。精度 ±1°F 是主流要求，带背光是加分项。",
    sortOrder: 20,
  },
  {
    title: "圣诞灯礼盒", titleEn: "Christmas Light Gift Boxes", keyword: "圣诞灯", strictKw: ["圣诞"],
    signalSource: "tiktok", signalText: "TikTok 美区新品周销 5,422 件（FastMoss 报道，截至 2026-10-21）",
    signalUrl: "https://www.fastmoss.com/blog/how-to-find-trending-products-tiktok-shop/", signalDate: "2026-10-21", retailPriceUsd: null,
    note: "纯季节品，12 月中旬后需求断崖。现在下单还能赶海运尾班，再晚只能空运，先算清账。",
    sortOrder: 21,
  },
  {
    title: "巴拉克拉法滑雪面罩", titleEn: "Balaclava Ski Mask", keyword: "滑雪面罩", strictKw: ["面罩", "头套"],
    signalSource: "tiktok", signalText: "TikTok 美区新品周销 5,752 件（FastMoss 报道，截至 2026-10-21）",
    signalUrl: "https://www.fastmoss.com/blog/how-to-find-trending-products-tiktok-shop/", signalDate: "2026-10-21", retailPriceUsd: null,
    note: "TikTok 穿搭内容带火的冬季配件，针织产业带产能充足。风潮品生命周期短，小单快返。",
    sortOrder: 22,
  },
  {
    title: "无热卷发棒套装", titleEn: "Heatless Curling Rod Set", keyword: "无热卷发棒", strictKw: ["卷发"],
    signalSource: "tiktok", signalText: "TikTok 美发类目持续热门选品（AliShopping Tools 月度选品报道，2026-09）",
    signalUrl: "https://news.astools.app/en/blog/top-tiktok-shop-products-september-2026", signalDate: "2026-09-11", retailPriceUsd: null,
    note: "不伤发概念在 TikTok 长红了两年还没退。丝绸面料版本客单价更高。",
    sortOrder: 23,
  },
  {
    title: "LED 露营灯", titleEn: "LED Camping Lantern", keyword: "露营灯", strictKw: ["露营灯"],
    signalSource: "amazon", signalText: "亚马逊美国站 Sports & Outdoors 畅销榜 #20",
    signalUrl: "https://www.amazon.com/dp/B077JK1S3F", signalDate: "2026-11-04", retailPriceUsd: null,
    note: "飓风季+冬季停电应急需求托底，不止露营场景。电池款出货带 UN38.3。",
    sortOrder: 24,
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
  return Number(rows[0]?.["COUNT(*)"] ?? rows[0]?.c ?? 0);
}

async function main() {
  const db = getDb();
  console.log(`开始编选 ${CANDIDATES.length} 个雷达品（产能数据实时查询，需 1-2 分钟）…`);
  let done = 0;
  for (const c of CANDIDATES) {
    let upstreamCount: number | null = null;
    let pMin: number | null = null;
    let pMax: number | null = null;
    let topSales: number | null = null;
    let imageUrl: string | null = null;
    try {
      const r = await searchOffers(c.keyword, 1);
      upstreamCount = r.total ?? null;
      const prices = r.items.map((p) => p.promotionPrice ?? p.price).filter((n) => n > 0);
      if (prices.length >= 3) {
        const med = median(prices);
        const sane = prices.filter((p) => p >= med * 0.15 && p <= med * 8); // 去掉配件价/套装价离群点
        const use = sane.length >= 2 ? sane : prices;
        pMin = Math.round(Math.min(...use) * 100) / 100;
        pMax = Math.round(Math.max(...use) * 100) / 100;
      } else if (prices.length > 0) {
        pMin = Math.round(Math.min(...prices) * 100) / 100;
        pMax = Math.round(Math.max(...prices) * 100) / 100;
      }
      const sales = r.items.map((p) => p.sales).filter((n) => n > 0);
      if (sales.length) topSales = Math.max(...sales);
      imageUrl = r.items.find((p) => p.image)?.image ?? null;
    } catch (e: any) {
      console.log(`  [上游查询失败，留空] ${c.title}: ${e?.message ?? e}`);
    }
    let vetted = 0;
    try {
      vetted = await strictVettedCount(c.strictKw);
    } catch (e: any) {
      console.log(`  [严选库查询失败] ${c.title}: ${e?.message ?? e}`);
    }
    await db.insert(radarItems).values({
      title: c.title,
      titleEn: c.titleEn,
      keyword: c.keyword,
      signalSource: c.signalSource,
      signalText: c.signalText,
      signalUrl: c.signalUrl,
      signalDate: c.signalDate,
      imageUrl,
      retailPriceUsd: c.retailPriceUsd != null ? String(c.retailPriceUsd) : null,
      factoryPriceMin: pMin != null ? String(pMin) : null,
      factoryPriceMax: pMax != null ? String(pMax) : null,
      upstreamCount,
      vettedCount: vetted,
      topSales,
      note: c.note,
      sortOrder: c.sortOrder,
      active: true,
    });
    done++;
    console.log(`  ✓ ${c.title} | 上游货源 ${upstreamCount ?? "?"} | 出厂 ¥${pMin ?? "?"}-${pMax ?? "?"} | 严选 ${vetted} 家 | 头部在售 ${topSales ?? "?"}`);
  }
  console.log(`完成 ${done}/${CANDIDATES.length}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
