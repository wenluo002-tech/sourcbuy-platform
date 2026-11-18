// 词→类目导航图 · 阶段一：收集词表与类目、候选预筛（只读）
import mysql from "mysql2/promise";
import fs from "fs";
import { LEXICON, expandQuery } from "../contracts/lexicon";

const u = new URL(fs.readFileSync(".env", "utf8").match(/^DATABASE_URL=(.+)$/m)![1].trim());
const conn = await mysql.createConnection({
  host: u.hostname, port: +(u.port || 4000),
  user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
  database: u.pathname.slice(1).split("?")[0], ssl: { rejectUnauthorized: false },
});

// 1. 类目清单（带商品数）
const [catRows] = await conn.query(
  `SELECT fine_category AS c, COUNT(*) AS n FROM legacy_products
   WHERE fine_category IS NOT NULL AND fine_category != '' GROUP BY fine_category`);
const cats = (catRows as any[]).map((r) => ({ c: r.c as string, n: +r.n }));
console.error(`类目总数: ${cats.length}`);

// 2. 词表 = LEXICON 产品词 + 真实搜索词
const wordSet = new Set<string>();
const wordBucket = new Map<string, string>();
for (const [bucket, def] of Object.entries(LEXICON)) {
  for (const p of def.products) {
    if (p.length >= 2 && !/[a-z]/i.test(p)) { wordSet.add(p); if (!wordBucket.has(p)) wordBucket.set(p, bucket); }
  }
}
const [qRows] = await conn.query(
  `SELECT DISTINCT query FROM offer_search_cache
   WHERE query NOT LIKE '[%' AND LENGTH(query) BETWEEN 2 AND 30`);
for (const r of qRows as any[]) {
  const q = String(r.query).trim();
  if (!wordSet.has(q)) { wordSet.add(q); const { category } = expandQuery(q); if (category) wordBucket.set(q, category); }
}
const words = [...wordSet];
console.error(`词表总数: ${words.length}`);

// 3. 每桶高频类目 top60（桶关键词命中类目名）
const bucketTopCats = new Map<string, string[]>();
for (const bucket of Object.keys(LEXICON)) {
  const kws = LEXICON[bucket].keywords.filter((k) => !/^[a-z]+$/i.test(k));
  const scored = cats
    .filter((ct) => kws.some((k) => ct.c.includes(k)))
    .sort((a, b) => b.n - a.n)
    .slice(0, 60)
    .map((x) => x.c);
  bucketTopCats.set(bucket, scored);
}

// 4. 候选预筛：最长公共子串 ≥2 的类目（高频优先 40 个）+ 同桶高频类目
function lcsLen(a: string, b: string): number {
  let best = 0;
  const dp: number[] = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let prev = 0;
    for (let j = 1; j <= b.length; j++) {
      const t = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev + 1 : 0;
      if (dp[j] > best) best = dp[j];
      prev = t;
    }
  }
  return best;
}
const result: Record<string, { bucket: string | null; candidates: string[] }> = {};
let empty = 0;
for (const w of words) {
  const bucket = wordBucket.get(w) ?? null;
  const textHits = cats.filter((ct) => lcsLen(w, ct.c) >= 2).sort((a, b) => b.n - a.n).slice(0, 40).map((x) => x.c);
  const bucketCats = bucket ? bucketTopCats.get(bucket) ?? [] : [];
  const merged = [...new Set([...textHits, ...bucketCats])];
  if (!merged.length) empty++;
  result[w] = { bucket, candidates: merged.slice(0, 60) };
}
console.error(`候选为空的词: ${empty}`);
fs.writeFileSync("/tmp/catmap-stage1.json", JSON.stringify({ words, cats: cats.map((x) => x.c), result }));
console.error("STAGE1_DONE");
await conn.end();
