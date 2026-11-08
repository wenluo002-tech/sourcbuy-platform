// 建材工业桶打标（jcgy_v1）：两路免费证据
//   A. 厂名高置信词（建材/铝业/铝型材/门窗/幕墙/栏杆/护栏/石材/管业/泵业/阀门/法兰/钢结构/吊顶/龙骨）
//      —— 玻璃/不锈钢/陶瓷等歧义词不进厂名层（玻璃杯/不锈钢餐具是消费品，v47 教训）
//   B. 商品池证据：offer_pool cat_path 以「家装建材」开头的在售货（sunclub 三级类目，比厂名精准）
// 纪律：贸易商/重复店铺不打；只 INSERT 不覆盖既有桶；(factory_id, category) 去重；默认 dry-run
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";

const EXECUTE = process.argv.includes("--execute");
const CAT = "建材工业";
const db: any = getDb();

const NAME_WORDS = ["建材", "铝业", "铝型材", "门窗", "幕墙", "栏杆", "护栏", "石材", "管业", "泵业", "阀门", "法兰", "钢结构", "吊顶", "龙骨"];

// A 路：厂名高置信词
const nameConds = NAME_WORDS.map((w) => `name LIKE '%${w}%'`).join(" OR ");
const [byName]: any = await db.execute(sql.raw(
  `SELECT id, name FROM factories WHERE (${nameConds}) AND is_trader=0 AND dup_of IS NULL`
));

// B 路：商品池「家装建材」在售证据（member_id 三形态 join）
const [byPool]: any = await db.execute(sql`
  SELECT DISTINCT f.id, f.name FROM factories f
  JOIN offer_pool p ON (p.member_id = f.member_id OR (f.seller_user_id IS NOT NULL AND f.seller_user_id != '' AND p.seller_user_id = f.seller_user_id))
  WHERE p.cat_path LIKE '家装建材%' AND f.is_trader = 0 AND f.dup_of IS NULL`);

// 已有该桶的跳过
const [existing]: any = await db.execute(sql`SELECT factory_id FROM factory_categories WHERE category=${CAT}`);
const have = new Set(existing.map((r: any) => r.factory_id));

const hits = new Map<number, { name: string; via: string[] }>();
for (const r of byName) {
  if (!hits.has(r.id)) hits.set(r.id, { name: r.name, via: [] });
  hits.get(r.id)!.via.push("name");
}
for (const r of byPool) {
  if (!hits.has(r.id)) hits.set(r.id, { name: r.name, via: [] });
  hits.get(r.id)!.via.push("pool");
}

let inserted = 0, skipped = 0;
for (const [fid, info] of hits) {
  if (have.has(fid)) { skipped++; continue; }
  if (EXECUTE) {
    await db.execute(sql`INSERT INTO factory_categories (factory_id, category, source) VALUES (${fid}, ${CAT}, 'jcgy_v1')`);
  }
  inserted++;
  if (!EXECUTE && inserted <= 20) console.log(`  [dry] #${fid} ${info.name}  via=${info.via.join("+")}`);
}

console.log(`\n建材工业桶：厂名命中 ${byName.length}，商品池命中 ${byPool.length}，合并去重 ${hits.size}，已有跳过 ${skipped}，${EXECUTE ? "实写入" : "将写入"} ${inserted}`);
if (!EXECUTE) console.log("确认无误后加 --execute 落库");
process.exit(0);
