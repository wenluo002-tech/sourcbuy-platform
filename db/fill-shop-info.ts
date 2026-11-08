// 万邦店铺详情回填器：item_get_shop(深度档案) + seller_info(home/诚信通年限/精确员工数)
// 纪律：只填 NULL 空位；评分列绝不写；zx/wl/sp/sh 分数字段语义未验证一律不写；成立年份≠诚信通年限不写 years；
//      区间值(51-100人)保守取下限；身份核验=返回title与库内厂名归一化全等才写，不过宁可空；默认 DRY=1；
//      熔断：单任务 ¥15 + 当日万邦 ¥20；台账 provider='wanbang'；断点列 shopinfo_checked_at
// 用法：npx tsx db/fill-shop-info.ts            (dry-run 前 5 家)
//      DRY=0 LIMIT=50 npx tsx db/fill-shop-info.ts
// 单价待 Andy 确认后填下方常量，台账成本按实际记
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";

const KEY = process.env.WANBANG_KEY!;
const SECRET = process.env.WANBANG_SECRET!;
const BASE = "https://api-gw.onebound.cn/1688";
const DRY = process.env.DRY !== "0";
const LIMIT = Number(process.env.LIMIT || 5);
const PRICE_ITEM_GET_SHOP = Number(process.env.PRICE_SHOP || 0.05); // Andy 2026-11-08 确认：0.05 元/次
const PRICE_SELLER_INFO = Number(process.env.PRICE_SELLER || 0.05); // 同上
const TASK_FUSE = Number(process.env.FUSE || 15), DAY_FUSE = Number(process.env.FUSE || 20);
// 分片并行：SHARDS=4 SHARD=0..3，各实例跑 MOD(id,SHARDS)=SHARD 的不相交子集；
// 熔断读当日台账（全局），多实例 FUSE 之和=总预算上限
const SHARDS = Math.max(1, Number(process.env.SHARDS || 1));
const SHARD = Math.max(0, Number(process.env.SHARD || 0));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (s: string) => (s ?? "").replace(/\s+/g, "").replace(/（/g, "(").replace(/）/g, ")").replace(/，/g, ",");

async function call(ep: string, sid: string): Promise<{ j: any; billed: boolean; ms: number }> {
  const t0 = Date.now();
  const qs = new URLSearchParams({ key: KEY, secret: SECRET, lang: "zh-CN", cache: "yes", sid });
  const res = await fetch(`${BASE}/${ep}/?${qs}`, { signal: AbortSignal.timeout(30000) });
  const j: any = await res.json();
  return { j, billed: j?.error_code === "0000", ms: Date.now() - t0 };
}

function parseDetail(detail: any): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(detail)) return out;
  for (const sec of detail) {
    for (const items of Object.values(sec ?? {})) {
      if (!Array.isArray(items)) continue;
      for (const it of items as any[]) {
        for (const [k, v] of Object.entries(it)) {
          const key = String(k).replace(/[:\s]+$/g, "").trim();
          if (key && v != null) out[key] = String(v).trim();
        }
      }
    }
  }
  return out;
}
const numFrom = (s: string | undefined): number | null => {
  const m = (s ?? "").replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
};
// 区间值取下限（"51 - 100 人"→51，保守真实）；精确值直取（"43人"→43）
const lowerBound = (s: string | undefined): number | null => numFrom(s);

async function main() {
  const db = getDb();
  const [c]: any = await db.execute(sql`SHOW COLUMNS FROM factories LIKE 'shopinfo_checked_at'`);
  if (!c.length) await db.execute(sql`ALTER TABLE factories ADD COLUMN shopinfo_checked_at DATETIME NULL`);

  // 当日万邦已花费（台账）
  const [sp]: any = await db.execute(sql`SELECT COALESCE(SUM(cost_cny),0) s FROM sourcing_api_logs WHERE provider='wanbang' AND DATE(created_at)=CURDATE()`);
  let spent = Number(sp[0].s);
  if (spent >= DAY_FUSE) { console.log(`当日万邦费用 ${spent.toFixed(2)} 已达熔断 ¥${DAY_FUSE}，退出`); process.exit(0); }

  const [rows]: any = await db.execute(sql`
    SELECT id, name, member_id, home, years, production_type, oem_mode, cert, cert_note, employee_count, area_sqm, service_capability, tags
    FROM factories
    WHERE (is_trader IS NULL OR is_trader = 0) AND dup_of IS NULL AND shopinfo_checked_at IS NULL
      AND member_id IS NOT NULL AND member_id <> ''
      AND (member_id LIKE 'b2b-%' OR member_id REGEXP '^[a-z0-9_]{3,32}$')
      AND MOD(id, ${SHARDS}) = ${SHARD}
      AND (home IS NULL OR home='' OR production_type IS NULL OR oem_mode IS NULL
           OR cert IS NULL OR cert='' OR employee_count IS NULL OR employee_count=0
           OR area_sqm IS NULL OR area_sqm=0)
    ORDER BY FIELD(tier,'金标','银标','铜标','优选','培育'), id LIMIT ${LIMIT}`);
  console.log(`待回填 ${rows.length} 家（DRY=${DRY}，分片 ${SHARD}/${SHARDS}，当日已花 ¥${spent.toFixed(2)}）`);
  if (!rows.length) process.exit(0);

  let hit = 0, miss = 0, mismatch = 0, calls = 0, cost = 0;
  for (const f of rows as any[]) {
    const writes: Record<string, unknown> = {};
    let okShop = false, okSeller = false, errMsg = "", fcost = 0;
    try {
      // ① item_get_shop：深度档案
      const r1 = await call("item_get_shop", f.member_id);
      calls++; fcost += r1.billed ? PRICE_ITEM_GET_SHOP : 0; okShop = r1.billed;
      if (r1.j?.error_code === "5000") { miss++; }
      else if (r1.billed) {
        if (norm(r1.j?.title ?? "") !== norm(f.name)) { mismatch++; errMsg = `名称不符:${String(r1.j?.title ?? "").slice(0, 40)}`; }
        else {
          const d = parseDetail(r1.j.detail);
          if (!f.production_type && d["经营模式"]) writes.production_type = d["经营模式"];
          if (!f.oem_mode && d["加工方式"]) {
            const oem = d["加工方式"].split(/[;；]/).map((s) => s.trim()).filter(Boolean);
            if (oem.length) writes.oem_mode = oem.join("/");
          }
          if ((!f.cert || f.cert === "") && d["管理体系认证"] && !/^(无|其他)$/.test(d["管理体系认证"])) writes.cert = d["管理体系认证"].replace(/[;；\s]+$/, "");
          if ((!f.cert_note || f.cert_note === "") && d["工商注册号/统一社会信用代码"]) writes.cert_note = `统一社会信用代码：${d["工商注册号/统一社会信用代码"]}`;
          if (f.employee_count == null || f.employee_count === 0) writes.employee_count = lowerBound(d["员工人数"]);
          if (f.area_sqm == null || f.area_sqm === 0) writes.area_sqm = numFrom(d["厂房面积"]);
          if (!f.service_capability) {
            const bits: string[] = [];
            if (/^是/.test(d["是否提供加工/定制服务"] ?? "")) bits.push("提供加工/定制服务");
            if (d["质量控制"] && d["质量控制"] !== "无") bits.push(`质量控制：${d["质量控制"]}`);
            if (bits.length) writes.service_capability = bits.join("；");
          }
          if (d["主营行业"]) {
            let tags: string[] = [];
            try { tags = JSON.parse(f.tags ?? "[]"); } catch { tags = []; }
            const add = d["主营行业"].split(/[;；]/).map((s) => s.trim()).filter((s) => s && !tags.includes(s));
            if (add.length) writes.tags = JSON.stringify([...tags, ...add]);
          }
        }
      }
      await sleep(1100);
      // ② seller_info：home / 诚信通年限 / 精确员工数（优先生效）
      const r2 = await call("seller_info", f.member_id);
      calls++; fcost += r2.billed ? PRICE_SELLER_INFO : 0; okSeller = r2.billed;
      if (r2.billed && !errMsg) {
        if ((!f.home || f.home === "") && r2.j?.zhuy) writes.home = String(r2.j.zhuy);
        if (f.years == null && r2.j?.tpyear != null) writes.years = Number(r2.j.tpyear) || null;
        const ci: any[] = Array.isArray(r2.j?.company_info) ? r2.j.company_info : [];
        const emp = ci.find((x) => x?.title === "员工人数")?.value;
        const exact = numFrom(emp);
        const empMissing = f.employee_count == null || f.employee_count === 0;
        if (empMissing && writes.employee_count == null && exact != null) writes.employee_count = exact;
        else if (empMissing && exact != null && writes.employee_count != null) writes.employee_count = exact; // 精确值覆盖区间下限
      }
      if (okShop && !errMsg) hit++;
    } catch (e: any) {
      errMsg = String(e?.message ?? e).slice(0, 150);
    }
    // 清掉 null 值写入
    for (const k of Object.keys(writes)) if (writes[k] == null) delete writes[k];

    if (!DRY) {
      const keys = Object.keys(writes).filter((k) => /^[a-z_]+$/.test(k));
      if (keys.length && !errMsg) {
        const sets = keys.map((k) => sql`${sql.raw(k)} = ${writes[k] as any}`);
        await db.execute(sql`UPDATE factories SET ${sql.join(sets, sql`, `)} WHERE id=${f.id}`);
      }
      await db.execute(sql`UPDATE factories SET shopinfo_checked_at=NOW() WHERE id=${f.id}`);
    }
    cost += fcost;
    await db.execute(sql`INSERT INTO sourcing_api_logs (provider, endpoint, query, cost_cny, billed, ok, duration_ms, error) VALUES ('wanbang','item_get_shop+seller_info',${f.name},${fcost},${okShop || okSeller},${!errMsg},0,${errMsg || null})`).catch(() => {});
    console.log(`[${f.id}] ${f.name.slice(0, 18)} → ${errMsg ? "跳过:" + errMsg : Object.keys(writes).length ? "写 " + Object.keys(writes).join(",") : "无空位可填"}(¥${fcost.toFixed(2)})`);
    if (spent + cost >= Math.min(TASK_FUSE, DAY_FUSE)) { console.log(`费用熔断 ¥${(spent + cost).toFixed(2)}，退出`); break; }
    await sleep(1100);
  }
  console.log(`完成：命中 ${hit} / 拿不到 ${miss} / 名称不符 ${mismatch}，调用 ${calls} 次，估算成本 ¥${cost.toFixed(2)}${PRICE_ITEM_GET_SHOP + PRICE_SELLER_INFO === 0 ? "（单价未确认，记0）" : ""}`);
  process.exit(0);
}
main().catch((e) => { console.log("FATAL:", String(e?.message ?? e).slice(0, 300)); process.exit(1); });
