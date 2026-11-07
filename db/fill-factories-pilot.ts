/// <reference lib="dom" />
// ═══ 品类补库试点（2026-11-07 罗总全权授权）：万邦 item_search_factory 按品类词采厂 ═══
// 目标：灯饰照明/文具办公/汽车用品 三短板类目各补至 250–300 家
// 纪律：默认 DRY-RUN（--execute 才落库）；评分列绝不写（无可靠评分源→培育档，review 写"工厂档案补全中。"）；
//       贸易商名头跳过不入库；cat_name 收敛必须命中来源桶（防杂货/错类）；seller_id 格式校验；
//       成本熔断：任务 ¥15 + 万邦全日 ¥20（台账口径）；限流 1s/页；幂等断点续跑（state JSON）
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
import { LEXICON } from "../contracts/lexicon";
import { GEO } from "./geo-map";
import * as fs from "node:fs";

const BASE = process.env.WANBANG_BASE ?? "https://api-gw.onebound.cn/1688";
const KEY = process.env.WANBANG_KEY!;
const SECRET = process.env.WANBANG_SECRET!;
const COST_PER = 0.022;
const TASK_CAP = 15;   // 任务级熔断（元）
const DAY_CAP = 20;    // 万邦全日熔断（元，含其他任务）
const EXECUTE = process.argv.includes("--execute");
const PAGES_PER_WORD = Number(process.env.PAGES ?? 6); // 每词抓页数（21 条/页）
const STATE_FILE = "/tmp/fill-factories-pilot.state.json"; // state 放 /tmp：/mnt fuse 层删写延迟会 EEXIST；幂等靠 inDb 判重，丢 state 只是重复扫页

// 试点三类目 × 精选搜索词（2–4 字、产业带明确、低歧义）
const PLAN: Record<string, string[]> = {
  "灯饰照明": ["吊灯", "吸顶灯", "台灯", "落地灯", "筒灯", "射灯", "灯带", "壁灯", "太阳能灯", "庭院灯", "小夜灯", "水晶灯"],
  "文具办公": ["中性笔", "马克笔", "笔记本", "便利贴", "文件夹", "订书机", "计算器", "白板", "记事本", "笔袋", "文具盒", "荧光笔"],
  "汽车用品": ["车载支架", "行车记录仪", "车载充电器", "方向盘套", "雨刮器", "充气泵", "车衣", "车载吸尘器", "遮阳挡", "洗车机", "应急启动电源", "车载冰箱"],
};

const TRADER_WORDS = ["贸易", "供应链", "商贸", "商行", "电子商务", "跨境电商", "进出口", "外贸"];

// 全词库唯一产品词 → 类目（与 tag-m4 同规则：跨类歧义词剔除）
const word2cat = new Map<string, string>();
const ambiguous = new Set<string>();
for (const [cat, def] of Object.entries(LEXICON)) {
  for (const w of def.products) {
    if (w.length < 2) continue;
    if (word2cat.has(w) && word2cat.get(w) !== cat) { ambiguous.add(w); word2cat.delete(w); }
    else if (!ambiguous.has(w)) word2cat.set(w, cat);
  }
}

function classifyCatName(catName: string): Map<string, number> {
  const hits = new Map<string, number>();
  const words = catName.split(/[;；、,，\/|]/).map((w) => w.trim()).filter((w) => w.length >= 2);
  for (const cw of words) {
    let cat = word2cat.get(cw) ?? null;
    if (!cat) {
      for (const [w, c] of word2cat) { if (cw.includes(w) || w.includes(cw)) { cat = c; break; } }
    }
    if (cat) hits.set(cat, (hits.get(cat) ?? 0) + 1);
  }
  return hits;
}

async function searchFactory(q: string, page: number): Promise<{ arr: any[]; billed: boolean }> {
  const qs = new URLSearchParams({ key: KEY, secret: SECRET, lang: "zh-CN", cache: "no", q, page: String(page) });
  const res = await fetch(`${BASE}/item_search_factory/?${qs}`, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`wanbang HTTP ${res.status}`);
  const j: any = await res.json();
  const billed = j?.error_code === "0000";
  const arr: any[] = Array.isArray(j?.item) ? j.item : [];
  return { arr, billed };
}

const esc = (v: string | null) => (v == null ? "NULL" : `'${v.replace(/'/g, "''")}'`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// /mnt 文件系统 writeFileSync 偶发 EEXIST，先删再写
function saveState(state: Record<string, number>) {
  try { fs.rmSync(STATE_FILE); } catch { /* 不存在 */ }
  fs.writeFileSync(STATE_FILE, JSON.stringify(state));
}
// seller_id 两种合法形态：b2b-xxx（新格式）/ 老格式 loginId（严选库 19% 用它，可入 member_id）
function validSellerId(sid: string): boolean {
  return /^b2b-[0-9a-z]+$/i.test(sid) || /^[a-z0-9_]{3,32}$/i.test(sid);
}

async function main() {
  const db = getDb();
  // 断点状态
  let state: Record<string, number> = {};
  try { state = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")); } catch { /* 首轮 */ }

  // 在库 member_id 全集（判重）
  const [exist]: any = await db.execute(sql`SELECT member_id FROM factories`);
  const inDb = new Set((exist as any[]).map((r) => String(r.member_id)));
  console.log(`在库 ${inDb.size} 个 member_id；模式：${EXECUTE ? "落库" : "DRY-RUN"}`);

  let calls = 0, cost = 0;
  const stats: Record<string, { added: number; dup: number; trader: number; mismatch: number;杂货: number; badId: number }> = {};

  for (const [bucket, words] of Object.entries(PLAN)) {
    stats[bucket] = { added: 0, dup: 0, trader: 0, mismatch: 0, 杂货: 0, badId: 0 };
    for (const w of words) {
      const donePages = state[`${bucket}/${w}`] ?? 0;
      for (let p = donePages + 1; p <= PAGES_PER_WORD; p++) {
        // 熔断检查（任务级 + 全日）
        const [day]: any = await db.execute(sql`SELECT COALESCE(SUM(cost_cny),0) s FROM sourcing_api_logs WHERE created_at >= CURDATE() AND provider='wanbang'`);
        const dayCost = Number(day[0].s);
        if (cost >= TASK_CAP || dayCost >= DAY_CAP) {
          console.log(`熔断：任务 ¥${cost.toFixed(2)} / 全日 ¥${dayCost.toFixed(2)}，断点已存，可续跑`);
          saveState(state);
          await summary();
          process.exit(0);
        }
        let arr: any[] = [], billed = false;
        try {
          ({ arr, billed } = await searchFactory(w, p));
        } catch (e: any) {
          console.log(`  [${bucket}/${w} p${p}] 请求失败 ${e.message}，跳过`);
          await sleep(1000);
          continue;
        }
        calls++;
        if (billed) cost += COST_PER;
        if (EXECUTE) {
          await db.execute(sql`INSERT INTO sourcing_api_logs (provider, endpoint, query, cost_cny, billed, ok) VALUES ('wanbang', 'item_search_factory', ${`${w}#p${p}`}, ${billed ? String(COST_PER) : "0"}, ${billed}, ${arr.length > 0})`);
        }
        if (!arr.length) { state[`${bucket}/${w}`] = p; await sleep(1000); continue; } // 空页（不扣费）也前进

        for (const it of arr) {
          const sid = String(it.seller_id ?? "");
          const name = String(it.title ?? "").trim();
          if (!validSellerId(sid) || !name) { stats[bucket].badId++; continue; }
          if (inDb.has(sid)) { stats[bucket].dup++; continue; }
          if (TRADER_WORDS.some((tw) => name.includes(tw))) { stats[bucket].trader++; inDb.add(sid); continue; }

          // cat_name 收敛：必须命中来源桶；>2 类=杂货铺跳过
          const hits = classifyCatName(String(it.cat_name ?? ""));
          let cats = [...hits.entries()];
          if (cats.length > 2) cats = cats.filter(([, n]) => n >= 2);
          if (!cats.length || cats.length > 2) { stats[bucket].杂货++; inDb.add(sid); continue; }
          if (!cats.some(([c]) => c === bucket)) { stats[bucket].mismatch++; inDb.add(sid); continue; }

          // 地区规范化
          const area = String(it.area ?? "").trim() || null;
          const g = area ? GEO[area] ?? GEO[`${area}市`] ?? null : null;
          const [prov, city, dist] = g ?? [null, null, null];

          // 诚信通年限（语义确定才写；其他分数字段语义未验证，一律不写）
          const y = Number(it.tpservice_year);
          const years = Number.isFinite(y) && y >= 1 && y <= 50 ? y : null;

          const catNames = String(it.cat_name ?? "").split(/[;；]/).map((s: string) => s.trim()).filter(Boolean);
          const tags = JSON.stringify(["wbpilot_v1", `搜索词:${w}`, ...catNames]);

          if (EXECUTE) {
            const ins = await db.execute(sql.raw(
              `INSERT INTO factories (member_id, name, location, province, city, district, years, score, tier, is_super, product_count, review, tags, is_trader)
               VALUES (${esc(sid)}, ${esc(name)}, ${esc(area)}, ${esc(prov)}, ${esc(city)}, ${esc(dist)},
                ${years ?? "NULL"}, NULL, '培育', 0, 0, '工厂档案补全中。', ${esc(tags)}, 0)`
            )) as any;
            const fid = Number(ins[0]?.insertId ?? 0);
            if (fid) {
              await db.execute(sql.raw(
                `INSERT INTO factory_scores (factory_id, quality_cert, factory_power, trust_years, repurchase, production, service, sales, composite, confidence)
                 VALUES (${fid}, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'low')`
              ));
              for (const [cat] of cats) {
                await db.execute(sql.raw(
                  `INSERT INTO factory_categories (factory_id, category, source) VALUES (${fid}, '${cat}', 'wbpilot_v1')`
                ));
              }
            }
          }
          inDb.add(sid);
          stats[bucket].added++;
        }
        state[`${bucket}/${w}`] = p;
        if (stats[bucket].added % 50 === 0 && stats[bucket].added > 0) {
          console.log(`  [${bucket}] 已新增 ${stats[bucket].added}（${calls} 页 / ¥${cost.toFixed(2)}）`);
          saveState(state);
        }
        await sleep(1000); // 限流 1 秒/页
      }
      saveState(state);
    }
    console.log(`[${bucket}] 完成：新增 ${stats[bucket].added} | 在库跳过 ${stats[bucket].dup} | 贸易商 ${stats[bucket].trader} | 类目不符 ${stats[bucket].mismatch} | 杂货 ${stats[bucket].杂货} | 坏ID ${stats[bucket].badId}`);
  }

  await summary();
  saveState(state);
  console.log(EXECUTE ? "═══ 已执行落库 ═══" : "═══ DRY-RUN（未写库，加 --execute 才落） ═══");
  process.exit(0);

  async function summary() {
    console.log(`\n═══ 补库试点汇总 ═══`);
    for (const [b, s] of Object.entries(stats)) {
      console.log(`${b}: 新增 ${s.added} | 重复 ${s.dup} | 贸易商 ${s.trader} | 错类 ${s.mismatch} | 杂货 ${s.杂货} | 坏ID ${s.badId}`);
    }
    console.log(`API ${calls} 页 / 试点成本 ¥${cost.toFixed(2)}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
