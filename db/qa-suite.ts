// ═══ SourcBuy 上线验收套件 v1：判卷的是检查单，不是人格 ═══
// 用法：npx tsx db/qa-suite.ts —— 全 PASS 才允许 build_version 存版本
// 覆盖：API 健康 / 以货带厂金标回归 / 追问卡四场景 / i18n 英文链路 / 页面健康 / 数据口径对账 / 费用台账
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
import { poolSearch, linkTopOffersToFactories } from "../api/sourcing/offerService";

const BASE = process.env.QA_BASE ?? "http://localhost:3200";
let pass = 0, fail = 0;
const fails: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) { pass++; console.log(`  ✓ ${name}${detail ? "  " + detail : ""}`); }
  else { fail++; fails.push(name); console.log(`  ✗ FAIL ${name}${detail ? "  " + detail : ""}`); }
}

async function chat(message: string, history: any[] = [], locale?: "zh" | "en") {
  const r = await fetch(`${BASE}/api/trpc/ai.chat`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ json: { message, history, locale } }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j: any = await r.json();
  return j.result.data.json;
}

console.log("\n[1] API 健康");
{
  const d = await chat("你好");
  check("ai.chat 返回 200 且有话术", typeof d.reply === "string" && d.reply.length > 10);
}

console.log("\n[2] 以货带厂金标回归（四品类必须全命中）");
for (const q of ["衣架", "蓝牙耳机", "保温杯", "瑜伽裤"]) {
  try {
    const pooled = await poolSearch(q, 20);
    const linked = await linkTopOffersToFactories(pooled, 3);
    check(`${q} 命中严选厂在册货`, linked.length >= 1, `${linked.length}家`);
  } catch (e: any) { check(`${q} 命中严选厂在册货`, false, String(e?.message).slice(0, 60)); }
}

console.log("\n[3] 追问卡四场景");
{
  const a = await chat("我想采购一批瑜伽裤");
  check("缺信息→出卡", !!a.followUp && a.followUp.questions.length >= 2, `${a.followUp?.questions?.length ?? 0}题`);
  const b = await chat("[补充] 数量:500–2,000 件；目的地:美国", [{ role: "user", content: "我想采购一批瑜伽裤" }, { role: "assistant", content: "好的" }]);
  check("提交补充→不再出卡", b.followUp == null);
  const c = await chat("[跳过补充] 这些先不谈，直接帮我配", [{ role: "user", content: "我想采购保温杯" }]);
  check("跳过→不再出卡", c.followUp == null);
  const d = await chat("我要2000件瑜伽裤发美国，一个月内到");
  check("信息全→不出卡", d.followUp == null);
}

console.log("\n[4] i18n 英文链路（locale=en 须全英文：问候兜底 / 追问卡 / 答卡协议）");
{
  const noCjk = (x: string) => !/[一-鿿]/.test(x);
  const g = await chat("hello", [], "en");
  check("en 问候为英文", noCjk(g.reply));
  const a = await chat("I want to source a batch of yoga pants", [], "en");
  check(
    "en 缺信息→出英文追问卡",
    !!a.followUp && a.followUp.questions.length >= 2 &&
      a.followUp.questions.every((q: any) => noCjk(q.label) && noCjk(q.why) && q.options.every((o: string) => noCjk(o))),
    `${a.followUp?.questions?.length ?? 0}题`
  );
  const b = await chat(
    "[补充] Quantity:500–2,000 pcs；Destination:USA",
    [{ role: "user", content: "I want to source yoga pants" }, { role: "assistant", content: "Sure" }],
    "en"
  );
  check("en 答卡→不再出卡", b.followUp == null);
  const c = await chat("I need 2000 pcs of yoga leggings shipped to the US within one month", [], "en");
  check("en 信息全→不再出卡", c.followUp == null);
}

console.log("\n[5] 页面健康");
for (const path of ["/", "/buyer", "/radar", "/factories"]) {
  try {
    const r = await fetch(`${BASE}${path}`, { headers: { Accept: "text/html" }, signal: AbortSignal.timeout(10_000) }); // SPA fallback 只在 Accept 含 text/html 时回 index.html
    check(`GET ${path}`, r.ok, `HTTP ${r.status}`);
  } catch (e: any) { check(`GET ${path}`, false, String(e?.message).slice(0, 40)); }
}

console.log("\n[6] 数据口径对账");
{
  const db = getDb();
  const [pool]: any = await db.execute(sql`SELECT COUNT(*) c FROM offer_pool`);
  const [fac]: any = await db.execute(sql`SELECT COUNT(*) c FROM factories`);
  check("严选库 = 4,060 家", Number(fac[0].c) === 4060, `实际 ${fac[0].c}`);
  check("产品池 ≥ 5,000 条", Number(pool[0].c) >= 5000, `实际 ${pool[0].c}`);
  const [logs]: any = await db.execute(sql`SELECT COUNT(*) c, IFNULL(SUM(cost_cny),0) cost FROM sourcing_api_logs WHERE created_at >= CURDATE()`);
  console.log(`  ℹ 今日 API 调用 ${logs[0].c} 次 / ¥${Number(logs[0].cost).toFixed(2)}`);
}

console.log(`\n═══ 验收结果：${pass} PASS / ${fail} FAIL ═══`);
if (fail) { console.log("失败项：", fails.join(" | ")); process.exit(1); }
console.log("检查单全过，允许存版本。");
process.exit(0);
