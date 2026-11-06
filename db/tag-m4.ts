// ═══ M4 厂库打标（免费层）═══
// Layer 1: 厂名行业词（手工精挑，规避"科技/实业"类通用词陷阱 v47 教训）
// Layer 2: 产品池在售标题证据（seller_user_id join，单一类目收敛才标）
// 词表来源 contracts/lexicon.ts 的 products（只用"全词库唯一"的词，排除跨类歧义词如 皮带/钱包）
// 拿不准的一律不标 —— 宁可空着，不乱标
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
import { LEXICON } from "../contracts/lexicon";

// 厂名行业词（只放"出现在厂名里即高置信"的词）
const NAME_WORDS: Record<string, string[]> = {
  "服装服饰": ["服装", "服饰", "制衣", "针织", "织造", "纺织", "内衣", "袜业", "帽业", "牛仔"],
  "鞋靴": ["鞋业", "制鞋", "鞋厂", "皮鞋", "运动鞋"],
  "箱包皮具": ["箱包", "皮具", "手袋", "包袋", "箱包厂"],
  "电子数码": ["电子", "电器", "光电", "数码", "电声"],
  "家居日用": ["家居", "日用品", "日用", "家纺", "床上用品"],
  "家具": ["家具", "家私", "橱柜"],
  "玩具母婴": ["玩具", "母婴", "婴童"],
  "美妆个护": ["化妆品", "化妆用具", "美妆", "美容", "日化"],
  "饰品配件": ["饰品", "首饰", "珠宝", "眼镜", "钟表"],
  "户外运动": ["户外", "体育用品", "健身器材", "健身", "渔具", "钓具", "帐篷"],
  "宠物用品": ["宠物"],
  "汽车用品": ["汽车用品", "汽配", "车载"],
  "灯饰照明": ["灯饰", "照明", "灯具"],
  "五金工具": ["五金", "工具", "锁具", "刃具"],
  "包装印刷": ["包装", "印刷", "彩印", "纸品包装"],
  "厨房餐饮": ["厨具", "餐具"],
  "工艺礼品": ["工艺品", "工艺", "礼品"],
  "文具办公": ["文具", "笔业", "办公用品", "文化用品"],
};
// 贸易商/非工厂特征词 —— 只统计不打标（数据质量问题，报给罗总）
const TRADER_WORDS = ["贸易", "供应链", "商贸", "商行", "电子商务", "跨境电商", "进出口", "外贸"];

// 全词库唯一产品词（len≥2 且只属于一个类目）
const word2cat = new Map<string, string>();
const ambiguous = new Set<string>();
for (const [cat, def] of Object.entries(LEXICON)) {
  for (const w of def.products) {
    if (w.length < 2) continue;
    if (word2cat.has(w) && word2cat.get(w) !== cat) { ambiguous.add(w); word2cat.delete(w); }
    else if (!ambiguous.has(w)) word2cat.set(w, cat);
  }
}
console.log(`唯一产品词 ${word2cat.size} 个，歧义剔除 ${ambiguous.size} 个`);

function tagByName(name: string): { cat: string; word: string } | null {
  let best: { cat: string; word: string } | null = null;
  for (const [cat, words] of Object.entries(NAME_WORDS)) {
    for (const w of words) {
      const pos = name.indexOf(w);
      if (pos < 0) continue;
      if (!best || w.length > best.word.length || (w.length === best.word.length && pos < name.indexOf(best.word)))
        best = { cat, word: w };
    }
  }
  if (best) return best;
  // 唯一产品词兜底（厂名含"渔具/衣架/保温杯"等）
  for (const [w, cat] of word2cat) {
    if (name.includes(w)) return { cat, word: w };
  }
  return null;
}

async function main() {
  const db = getDb();
  const [rows] = await db.execute(sql`
    SELECT f.id, f.name, f.seller_user_id FROM factories f
    WHERE NOT EXISTS (SELECT 1 FROM factory_categories fc WHERE fc.factory_id = f.id)`) as any;
  console.log(`待打标 ${rows.length} 家`);

  const inserts: { fid: number; cat: string; src: string }[] = [];
  let nameHits = 0, poolHits = 0, traderCount = 0;
  const traderNames: string[] = [];
  const catStat = new Map<string, number>();

  for (const f of rows as any[]) {
    // Layer 1 厂名
    const hit = tagByName(f.name ?? "");
    if (hit) {
      inserts.push({ fid: f.id, cat: hit.cat, src: "name_v1" });
      nameHits++;
      catStat.set(hit.cat, (catStat.get(hit.cat) ?? 0) + 1);
      continue;
    }
    // 贸易商名头的公司不进产品池证据层（店里有啥卖啥，标题不代表主业，v47 教训）
    const isTrader = TRADER_WORDS.some(w => (f.name ?? "").includes(w));
    if (isTrader) { traderCount++; if (traderNames.length < 15) traderNames.push(f.name); }
    // Layer 2 产品池在售证据
    if (!isTrader && f.seller_user_id) {
      const [prods] = await db.execute(sql`SELECT title FROM offer_pool WHERE seller_user_id = ${f.seller_user_id}`) as any;
      const hits = new Map<string, number>();
      for (const p of prods as any[]) {
        const t: string = p.title ?? "";
        const seen = new Set<string>();
        for (const [w, cat] of word2cat) if (!seen.has(cat) && t.includes(w)) { hits.set(cat, (hits.get(cat) ?? 0) + 1); seen.add(cat); }
      }
      if (hits.size === 1) {
        const [cat] = [...hits.keys()];
        inserts.push({ fid: f.id, cat, src: "pool_v1" });
        poolHits++;
        catStat.set(cat, (catStat.get(cat) ?? 0) + 1);
        continue;
      }
      if (hits.size > 1) {
        const sorted = [...hits.entries()].sort((a, b) => b[1] - a[1]);
        if (sorted[0][1] >= 2 && sorted[0][1] > sorted[1][1]) {
          inserts.push({ fid: f.id, cat: sorted[0][0], src: "pool_v1" });
          poolHits++;
          catStat.set(sorted[0][0], (catStat.get(sorted[0][0]) ?? 0) + 1);
          continue;
        }
      }
    }
  }

  // 批量插入
  for (let i = 0; i < inserts.length; i += 100) {
    await Promise.all(inserts.slice(i, i + 100).map(r =>
      db.execute(sql`INSERT INTO factory_categories (factory_id, category, source) VALUES (${r.fid}, ${r.cat}, ${r.src})`)));
  }
  console.log(`\n═══ 结果 ═══`);
  console.log(`厂名打标: ${nameHits} 家 | 产品池打标: ${poolHits} 家 | 仍无证据: ${rows.length - nameHits - poolHits} 家`);
  console.log(`其中疑似贸易商/供应链公司（未打标，数据质量问题）: ${traderCount} 家`);
  console.log(`类目分布:`, [...catStat.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}:${n}`).join(" "));
  if (traderNames.length) console.log(`贸易商样本: ${traderNames.join(" / ")}`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
