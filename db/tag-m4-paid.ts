// ═══ M4 打标付费层：万邦 item_search_factory 按公司名搜店铺 → cat_name 主营类目 → 词库分类 ═══
// 成本：0.022 元/次（仅 error_code=0000 扣费，搜不到不扣）；任务级熔断 ¥35（罗总 2026-11-06 授权"该花的钱不要省"）
// 身份核验三道：seller_id==member_id → 全名相等 → 字号核心词+同城；验不过宁可不标（不张冠李戴）
// 贸易商已 is_trader=1 排除在本任务外
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
import { LEXICON } from "../contracts/lexicon";

const BASE = process.env.WANBANG_BASE ?? "https://api-gw.onebound.cn/1688";
const KEY = process.env.WANBANG_KEY!;
const SECRET = process.env.WANBANG_SECRET!;
const COST_CAP = 35; // 任务级熔断（元）
const COST_PER = 0.022;

// 全词库唯一产品词（与 tag-m4.ts 同规则）
const word2cat = new Map<string, string>();
const ambiguous = new Set<string>();
for (const [cat, def] of Object.entries(LEXICON)) {
  for (const w of def.products) {
    if (w.length < 2) continue;
    if (word2cat.has(w) && word2cat.get(w) !== cat) { ambiguous.add(w); word2cat.delete(w); }
    else if (!ambiguous.has(w)) word2cat.set(w, cat);
  }
}

const REGION_RE = /^(中国|浙江省?|江苏省?|广东省?|山东省?|河南省?|河北省?|福建省?|安徽省?|湖南省?|湖北省?|四川省?|江西省?|辽宁省?|上海|北京|天津|重庆)?([一-龥]{2,4}市|[一-龥]{2,4}县|[一-龥]{2,4}区)?/;
const SUFFIX_RE = /(有限责任公司|股份有限公司|有限公司|制造厂|制品厂|加工厂|工厂|厂|商行|经营部|工作室)$/;

function coreName(name: string): string {
  let s = name.replace(REGION_RE, "");
  s = s.replace(SUFFIX_RE, "");
  return s;
}

function classifyCatName(catName: string): Map<string, number> {
  const hits = new Map<string, number>();
  const words = catName.split(/[;；、,，\/|]/).map(w => w.trim()).filter(w => w.length >= 2);
  for (const cw of words) {
    let cat = word2cat.get(cw) ?? null;
    if (!cat) {
      for (const [w, c] of word2cat) { if (cw.includes(w) || w.includes(cw)) { cat = c; break; } }
    }
    if (cat) hits.set(cat, (hits.get(cat) ?? 0) + 1);
  }
  return hits;
}

async function searchFactory(q: string): Promise<{ arr: any[]; billed: boolean }> {
  const qs = new URLSearchParams({ key: KEY, secret: SECRET, lang: "zh-CN", cache: "no", q, page: "1" });
  const res = await fetch(`${BASE}/item_search_factory/?${qs}`, { signal: AbortSignal.timeout(30000) });
  const j: any = await res.json();
  const billed = j?.error_code === "0000";
  const arr: any[] = Array.isArray(j?.item) ? j.item : [];
  return { arr, billed };
}

async function main() {
  const db = getDb();
  const [rows] = await db.execute(sql`
    SELECT f.id, f.name, f.member_id, f.city FROM factories f
    WHERE f.is_trader = 0
      AND NOT EXISTS (SELECT 1 FROM factory_categories fc WHERE fc.factory_id = f.id)
    ORDER BY f.score DESC`) as any;
  const pilot = Number(process.env.PILOT ?? 0);
  if (pilot) (rows as any[]).length = Math.min(pilot, (rows as any[]).length);
  console.log(`付费层目标 ${rows.length} 家（贸易商已排除）${pilot ? ` [试跑 ${pilot}]` : ""}`);

  let calls = 0, billedCalls = 0, cost = 0, tagged = 0, noHit = 0, idFail = 0, noCat = 0;
  const catStat = new Map<string, number>();

  for (const f of rows as any[]) {
    if (cost >= COST_CAP) { console.log(`\n触发任务熔断 ¥${COST_CAP}，停止`); break; }
    // 第一道：全名搜
    let { arr, billed } = await searchFactory(f.name);
    calls++; if (billed) { billedCalls++; cost += COST_PER; }
    // 搜不到（不扣费）→ 字号核心词补搜一次
    if (!arr.length) {
      const core = coreName(f.name);
      if (core.length >= 2 && core !== f.name) {
        ({ arr, billed } = await searchFactory(core));
        calls++;
        if (billed) { billedCalls++; cost += COST_PER; }
      }
    }
    await db.execute(sql`INSERT INTO sourcing_api_logs (provider, endpoint, query, cost_cny, billed, ok) VALUES ('wanbang', 'item_search_factory', ${f.name}, ${billed ? String(COST_PER) : "0"}, ${billed}, ${arr.length > 0})`);

    if (!arr.length) { noHit++; await new Promise(r => setTimeout(r, 1000)); continue; }

    // 身份核验
    const core = coreName(f.name);
    const cand = arr.find(x => x.seller_id && x.seller_id === f.member_id)
      ?? arr.find(x => String(x.title ?? "") === f.name)
      ?? arr.find(x => core.length >= 3 && String(x.title ?? "").includes(core) && (!f.city || String(x.area ?? "").includes(f.city.replace(/市$/, ""))));
    if (!cand) { idFail++; await new Promise(r => setTimeout(r, 1000)); continue; }

    // cat_name 分类
    const hits = classifyCatName(String(cand.cat_name ?? ""));
    let cats = [...hits.entries()];
    if (cats.length > 2) cats = cats.filter(([, n]) => n >= 2);
    if (!cats.length || cats.length > 2) { noCat++; await new Promise(r => setTimeout(r, 1000)); continue; }

    for (const [cat] of cats) {
      await db.execute(sql`INSERT INTO factory_categories (factory_id, category, source) VALUES (${f.id}, ${cat}, 'wbshop_v1')`);
      catStat.set(cat, (catStat.get(cat) ?? 0) + 1);
    }
    tagged++;
    if (tagged % 25 === 0) console.log(`  进度: ${calls} 调用 / ${tagged} 打标 / ¥${cost.toFixed(2)}`);
    await new Promise(r => setTimeout(r, 1000)); // 限流 1 秒/次
  }

  console.log(`\n═══ 付费层结果 ═══`);
  console.log(`调用 ${calls} 次（计费 ${billedCalls} 次 / ¥${cost.toFixed(2)}）| 打标 ${tagged} 家 | 搜不到 ${noHit} | 身份核验不过 ${idFail} | 类目无法收敛 ${noCat}`);
  console.log(`类目分布:`, [...catStat.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}:${n}`).join(" "));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
