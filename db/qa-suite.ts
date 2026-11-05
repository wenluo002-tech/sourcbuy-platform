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

// 雷达卡 GT 链接依赖 titleEn——为空则链接指向中文词，海外买家视角不准
{
  const { listRadar } = await import("../api/queries/radar");
  const radar = await listRadar();
  check("雷达条目均带英文品名（GT 链接可用）", radar.items.length > 0 && radar.items.every((it: any) => !!it.titleEn), `${radar.items.length} 条`);
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

console.log("\n[7] M3a 账号与会话记忆");
{
  const em = `qa-${Date.now()}@sourcbuy.test`;
  const pw = "qa-pass-123456";
  const call = async (path: string, body?: any, cookie?: string, method: "POST" | "GET" = "POST") => {
    // tRPC v11：mutation 走 POST，query 走 GET（input 在 query 参数里）
    const url = method === "GET"
      ? `${BASE}/api/trpc/${path}${body !== undefined ? `?input=${encodeURIComponent(JSON.stringify({ json: body }))}` : ""}`
      : `${BASE}/api/trpc/${path}`;
    const r = await fetch(url, {
      method, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
      body: method === "POST" && body !== undefined ? JSON.stringify({ json: body }) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    const setCookie = r.headers.get("set-cookie") ?? "";
    const m = setCookie.match(/sb_session=([^;]*)/);
    const json: any = await r.json().catch(() => null);
    return { status: r.status, json, cookie: m && m[1] ? `sb_session=${m[1]}` : null };
  };
  const reg = await call("auth.register", { email: em, password: pw, displayName: "QA", locale: "zh" });
  check("注册成功且下发会话 cookie", reg.status === 200 && !!reg.cookie && !!reg.json?.result?.data?.json?.user?.id);
  const cookie = reg.cookie ?? "";
  const me1 = await call("auth.me", undefined, cookie, "GET");
  check("me 返回刚注册的邮箱", me1.json?.result?.data?.json?.email === em);
  const chat1 = await call("ai.chat", { message: "衣架 500个 发美国", history: [], locale: "zh" }, cookie);
  const tid = chat1.json?.result?.data?.json?.threadId;
  check("聊天返回 threadId（落库成功）", typeof tid === "number" && tid > 0);
  const list = await call("threads.list", undefined, cookie, "GET");
  const listed = list.json?.result?.data?.json ?? [];
  check("会话列表含本次会话", Array.isArray(listed) && listed.some((x: any) => x.id === tid));
  const detail = await call("threads.detail", { threadId: tid }, cookie, "GET");
  const msgs = detail.json?.result?.data?.json?.messages ?? [];
  check("会话回放消息≥2条且含卡片快照", msgs.length >= 2 && msgs[1]?.payload != null, `${msgs.length} 条`);
  // 越权检查：别人的 cookie 读不到这个会话
  const reg2 = await call("auth.register", { email: `qa2-${Date.now()}@sourcbuy.test`, password: pw, locale: "zh" });
  const detail2 = await call("threads.detail", { threadId: tid }, reg2.cookie ?? "", "GET");
  check("他人读会话被拒（返回 null）", detail2.json?.result?.data?.json === null);
  const out = await call("auth.logout", {}, cookie);
  const me2 = await call("auth.me", undefined, cookie, "GET");
  check("退出后 me 为空", out.status === 200 && (me2.json?.result?.data?.json === null));
  // 登录老账号能取回
  const login = await call("auth.login", { email: em, password: pw });
  check("重新登录成功", login.status === 200 && login.json?.result?.data?.json?.user?.email === em);
}

console.log("\n[8] M3b 订单状态机");
{
  const em = `qa-${Date.now()}@sourcbuy.test`;
  const pw = "qa-pass-123456";
  const call = async (path: string, body?: any, cookie?: string, method: "POST" | "GET" = "POST") => {
    const url = method === "GET"
      ? `${BASE}/api/trpc/${path}${body !== undefined ? `?input=${encodeURIComponent(JSON.stringify({ json: body }))}` : ""}`
      : `${BASE}/api/trpc/${path}`;
    const r = await fetch(url, {
      method, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
      body: method === "POST" && body !== undefined ? JSON.stringify({ json: body }) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    const m = (r.headers.get("set-cookie") ?? "").match(/sb_session=([^;]*)/);
    const json: any = await r.json().catch(() => null);
    return { status: r.status, json, cookie: m && m[1] ? `sb_session=${m[1]}` : null };
  };
  const reg = await call("auth.register", { email: em, password: pw, displayName: "QA订单", locale: "zh" });
  const cookie = reg.cookie ?? "";
  // 1. 发起询价（手动需求）
  const c = await call("orders.create", { demand: "QA 测试：瑜伽裤 500 条发德国", quantity: 500, destination: "德国" }, cookie);
  const oid = c.json?.result?.data?.json?.orderId;
  check("发起询价建档成功", typeof oid === "number" && oid > 0);
  // 2. 列表含该单
  const lst = await call("orders.list", undefined, cookie, "GET");
  const myOrders = lst.json?.result?.data?.json ?? [];
  check("订单列表含本单", Array.isArray(myOrders) && myOrders.some((x: any) => x.id === oid));
  // 3. 详情含创建事件
  const d1 = await call("orders.detail", { orderId: oid }, cookie, "GET");
  const det = d1.json?.result?.data?.json;
  check("详情含询价事件留痕", det?.events?.length >= 1 && det.events[0].toStatus === "inquiry");
  // 4. 越权：另一用户读不到
  const reg2 = await call("auth.register", { email: `qa2-${Date.now()}@sourcbuy.test`, password: pw, locale: "zh" });
  const d2 = await call("orders.detail", { orderId: oid }, reg2.cookie ?? "", "GET");
  check("他人读订单被拒（返回 null）", d2.json?.result?.data?.json === null);
  // 5. 非法流转：inquiry 状态买家直接确认收货 → 拒绝
  const bad = await call("orders.act", { orderId: oid, action: "confirmReceive" }, cookie);
  check("非法流转被拒（inquiry→received）", bad.json?.error != null);
  // 6. 运营报价：inquiry→quoted 带报价快照（直接调查询层，等价 CLI）
  const { transitionOrder } = await import("../api/queries/orders");
  const tq = await transitionOrder({ orderId: oid, to: "quoted", actor: "ops", note: "QA 核价", quote: { goodsTotalCny: 14310, commissionUsd: 157.9, commissionRate: 0.07, totalUsd: 2835, fxRate: 6.34, quotedAt: new Date().toISOString() } });
  check("运营报价流转成功", tq.ok === true);
  // 7. 报价快照落库
  const d3 = await call("orders.detail", { orderId: oid }, cookie, "GET");
  const det3 = d3.json?.result?.data?.json;
  check("报价快照落库（含佣金拆解）", det3?.quote?.commissionRate === 0.07 && det3?.quote?.totalUsd === 2835);
  // 8. 买家确认报价 → 待付款
  const ok1 = await call("orders.act", { orderId: oid, action: "confirmQuote" }, cookie);
  check("买家确认报价→待付款", ok1.json?.result?.data?.json?.to === "pending_payment");
  // 9. 重复/越级流转仍被拒（pending_payment→received）
  const bad2 = await call("orders.act", { orderId: oid, action: "confirmReceive" }, cookie);
  check("越级流转仍被拒（pending_payment→received）", bad2.json?.error != null);
  // 10. 事件留痕完整：inquiry→quoted→pending_payment 三条
  const d4 = await call("orders.detail", { orderId: oid }, cookie, "GET");
  check("事件链完整（3 条留痕）", (d4.json?.result?.data?.json?.events?.length ?? 0) === 3);
}

console.log(`\n═══ 验收结果：${pass} PASS / ${fail} FAIL ═══`);
if (fail) { console.log("失败项：", fails.join(" | ")); process.exit(1); }
console.log("检查单全过，允许存版本。");
process.exit(0);
