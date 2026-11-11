// M5 端到端验收：埋点→注册绑归因→接受报价快照→管理端口径→ops 闸。
// 走真实 HTTP（/api/track、/api/trpc）+ 直接函数调用（transitionOrder），全程构造测试数据，结束时全部清掉，不污染台账。
import { getDb } from "../api/queries/connection";
import { sql as dsql } from "drizzle-orm";
import { transitionOrder } from "../api/queries/orders";
import { adminOverview, adminBuyers, adminBuyerDetail, adminOrders, adminHealth } from "../api/queries/admin";
import { GMV_MODE } from "../contracts/metrics";

process.loadEnvFile();
const db = getDb();
const BASE = "http://localhost:3200";
const stamp = Date.now().toString(36);
const ANON = `m5e2e-${stamp}`;
const EMAIL = `m5e2e_${stamp}@test.dev`;
const PASS = "m5e2e-pass-88";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra?: string) => {
  if (cond) { pass++; console.log(`PASS  ${name}${extra ? " — " + extra : ""}`); }
  else { fail++; console.log(`FAIL  ${name}${extra ? " — " + extra : ""}`); }
};

let orderId = 0;
let userId = 0;

try {
  // ① 埋点：两次访问——首触 tiktok，末触 facebook（验证首触/末触分开记账）
  const t1 = await fetch(`${BASE}/api/track`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: "page_view", anonId: ANON, path: "/", utmSource: "tiktok", utmMedium: "cpc", utmCampaign: "m5e2e", lang: "en" }),
  });
  ok("POST /api/track 返回 204", t1.status === 204, `status=${t1.status}`);
  await new Promise((r) => setTimeout(r, 1200)); // 保证 ts 先后有别
  await fetch(`${BASE}/api/track`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: "page_view", anonId: ANON, path: "/factories", utmSource: "facebook", lang: "en" }),
  });
  const [evs]: any = await db.execute(dsql`SELECT COUNT(*) n FROM analytics_events WHERE anon_id=${ANON}`);
  ok("两条事件落库", Number(evs[0].n) === 2, `n=${evs[0].n}`);

  // ② 注册（真实 tRPC HTTP）：应绑首触归因 + 历史事件补挂 user_id
  const reg = await fetch(`${BASE}/api/trpc/auth.register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ json: { email: EMAIL, password: PASS, displayName: "M5 E2E", locale: "en", anonId: ANON } }),
  });
  const regBody: any = await reg.json();
  const regData = regBody?.result?.data?.json ?? regBody?.result?.data;
  userId = regData?.user?.id;
  ok("tRPC 注册成功", reg.status === 200 && !!userId, `status=${reg.status} uid=${userId} err=${JSON.stringify(regBody?.error?.json?.message ?? regBody?.error ?? "").slice(0, 120)}`);

  const [u1]: any = await db.execute(dsql`SELECT attr FROM users WHERE id=${userId}`);
  const attr1 = typeof u1[0]?.attr === "string" ? JSON.parse(u1[0].attr) : u1[0]?.attr;
  ok("注册绑首触归因=tiktok", attr1?.source === "tiktok" && attr1?.campaign === "m5e2e", JSON.stringify(attr1));
  const [evs2]: any = await db.execute(dsql`SELECT COUNT(*) n FROM analytics_events WHERE anon_id=${ANON} AND user_id=${userId}`);
  ok("历史事件补挂 user_id", Number(evs2[0].n) === 2, `n=${evs2[0].n}`);

  // ③ 接受报价：构造 quoted 订单 → transitionOrder → 快照 accepted_at/gmv/末触归因
  const [ins]: any = await db.execute(
    dsql`INSERT INTO orders (order_no, user_id, product_title, quantity, destination, demand, status, quote)
      VALUES (${"SB-TEST-" + stamp}, ${userId}, "M5 E2E 测试商品", 10, "US", "e2e", "quoted",
        ${JSON.stringify({ totalUsd: 123.45, commissionUsd: 6.17, commissionRate: 0.05, fxRate: 6.34, goodsTotalCny: 500, quotedAt: new Date().toISOString() })})`
  );
  orderId = Number(ins.insertId);
  const tr = await transitionOrder({ orderId, to: "pending_payment", actor: "buyer", userId, anonId: ANON, note: "m5 e2e" });
  ok("quoted→pending_payment 流转成功", tr.ok === true, JSON.stringify(tr));
  const [o1]: any = await db.execute(dsql`SELECT accepted_at, gmv_usd, attr FROM orders WHERE id=${orderId}`);
  const oattr = typeof o1[0]?.attr === "string" ? JSON.parse(o1[0].attr) : o1[0]?.attr;
  ok("accepted_at 已写入", !!o1[0]?.accepted_at, String(o1[0]?.accepted_at));
  ok("gmv_usd 快照 = 123.45", Math.abs(Number(o1[0]?.gmv_usd) - 123.45) < 0.001, `gmv=${o1[0]?.gmv_usd} mode=${GMV_MODE}`);
  ok("末触归因=facebook（覆盖首触）", oattr?.source === "facebook", JSON.stringify(oattr));

  // ④ 管理端口径
  const ov = await adminOverview("today");
  ok("overview.today 有访客", ov.kpis.uv >= 1, `uv=${ov.kpis.uv} pv=${ov.kpis.pv}`);
  ok("overview.today 成交含测试单", ov.kpis.accepted >= 1 && ov.kpis.gmv >= 123.45, `accepted=${ov.kpis.accepted} gmv=${ov.kpis.gmv}`);
  const ch = ov.channels.map((c) => c.channel);
  ok("渠道列表出现 TikTok 与 Facebook", ch.includes("TikTok") && ch.some((c) => c.startsWith("Facebook")), ch.join(","));
  const buyers = await adminBuyers(EMAIL);
  ok("买家列表可搜到且渠道=TikTok（首触）", buyers.length === 1 && buyers[0].channel === "TikTok", JSON.stringify(buyers[0]?.channel));
  const detail = await adminBuyerDetail(userId);
  ok("买家详情含订单", !!detail && detail.orders.length === 1, `orders=${detail?.orders.length}`);
  const orderRows = await adminOrders("pending_payment");
  ok("订单管理可筛到测试单", orderRows.some((r: any) => r.id === orderId));
  const health = await adminHealth();
  ok("健康页数据可取", health.factories.total > 0 && health.translationCache > 0, `factories=${health.factories.total}`);

  // ⑤ ops 闸：无 token 请求 admin.overview 必须 403
  const noauth = await fetch(`${BASE}/api/trpc/admin.overview?input=${encodeURIComponent(JSON.stringify({ json: {} }))}`);
  const naBody: any = await noauth.json().catch(() => ({}));
  const naCode = naBody?.error?.json?.code ?? naBody?.error?.code;
  ok("无凭证访问 admin.overview 被拒", noauth.status === 401 || noauth.status === 403 || naCode === "UNAUTHORIZED" || naCode === "FORBIDDEN", `status=${noauth.status} code=${naCode}`);

  // ⑥ 幂等：重复接受同一订单不刷新 accepted_at
  const before = o1[0].accepted_at;
  await transitionOrder({ orderId, to: "pending_payment", actor: "ops", note: "dup-test" }).catch(() => {});
  const [o2]: any = await db.execute(dsql`SELECT accepted_at FROM orders WHERE id=${orderId}`);
  ok("accepted_at 不被重复覆盖", String(o2[0].accepted_at) === String(before), `${before} vs ${o2[0].accepted_at}`);
} finally {
  // 清场：测试痕迹一条不留
  if (orderId) {
    await db.execute(dsql`DELETE FROM order_events WHERE order_id=${orderId}`).catch(() => {});
    await db.execute(dsql`DELETE FROM orders WHERE id=${orderId}`).catch(() => {});
  }
  await db.execute(dsql`DELETE FROM analytics_events WHERE anon_id=${ANON}`).catch(() => {});
  if (userId) {
    await db.execute(dsql`DELETE FROM auth_sessions WHERE user_id=${userId}`).catch(() => {});
    await db.execute(dsql`DELETE FROM users WHERE id=${userId}`).catch(() => {});
  }
  console.log(`\n清场完成。${pass} PASS / ${fail} FAIL`);
}
process.exit(fail ? 1 : 0);
