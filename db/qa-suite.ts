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

console.log("\n[3] 字段级来源标注（四态：user/ai/derived/unknown）");
{
  const d = await chat("我要500条瑜伽裤预算8000美元发美国");
  const s = d.intentSources;
  check("intentSources 结构存在", !!s && typeof s === "object");
  if (s) {
    check("品类标 user", s.product?.source === "user", s.product?.source);
    check("数量标 user", s.quantity?.source === "user", s.quantity?.source);
    check("目的地标 user", s.destination?.source === "user", s.destination?.source);
    check("产地缺→unknown 不猜", s.region?.source === "unknown", s.region?.source);
  }
}

console.log("\n[3c] 数据层翻译管线（detailV2 locale=en → 标题英文化；第二次走缓存零成本）");
{
  const db = await getDb();
  const rows: any = await db.execute(sql`SELECT offer_id, title FROM offer_pool WHERE title IS NOT NULL AND CHAR_LENGTH(title) > 8 LIMIT 1`);
  const row = rows?.[0]?.[0] ?? rows?.[0];
  if (!row) check("商品池取样", false, "offer_pool 空");
  else {
    const q = async () => {
      const r = await fetch(`${BASE}/api/trpc/products.detailV2?input=${encodeURIComponent(JSON.stringify({ json: { offerId: row.offer_id, locale: "en" } }))}`, { signal: AbortSignal.timeout(45_000) });
      const j: any = await r.json();
      return j.result?.data?.json;
    };
    const d1 = await q();
    const noCjk = (x: string) => !/[一-鿿]/.test(x);
    check("英文标题返回且不含中文", !!d1?.offer?.title && noCjk(d1.offer.title), d1?.offer?.title?.slice(0, 50));
    const t0 = Date.now();
    const d2 = await q();
    check("第二次命中缓存（<3s）", !!d2?.offer?.title && Date.now() - t0 < 3000, `${Date.now() - t0}ms`);
    const cached: any = await db.execute(sql`SELECT COUNT(*) AS c FROM text_translations WHERE target_lang = 'en'`);
    const cnt = cached?.[0]?.[0]?.c ?? cached?.[0]?.c;
    check("翻译结果已落库", Number(cnt) > 0, `${cnt} 条`);
  }
}

console.log("\n[3d] 多语言字典键集一致性（es/fr/pt/ka 与 zh 同键，占位符在位）");
{
  const flat = (obj: any, prefix = ""): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      const p = prefix ? `${prefix}.${k}` : k;
      if (typeof v === "string") out[p] = v;
      else if (Array.isArray(v)) v.forEach((x, i) => { if (typeof x === "string") out[`${p}.${i}`] = x; else Object.assign(out, flat(x, `${p}.${i}`)); });
      else if (v && typeof v === "object") Object.assign(out, flat(v, p));
    }
    return out;
  };
  const { zh: zd } = await import("../src/i18n/zh");
  const zhKeys = Object.keys(flat(zd));
  const ph = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort().join(",");
  for (const l of ["es", "fr", "pt", "ka"]) {
    try {
      const mod: any = await import(`../src/i18n/${l}`);
      const ld = flat(mod[l]);
      const missing = zhKeys.filter((k) => ld[k] == null);
      const badPh = zhKeys.filter((k) => ld[k] != null && ph(ld[k]) !== ph(flat(zd)[k]));
      check(`${l} 键集一致（缺 ${missing.length}）且占位符无误（错 ${badPh.length}）`, missing.length === 0 && badPh.length === 0, missing.slice(0, 2).concat(badPh.slice(0, 2)).join(" ") || "OK");
    } catch {
      check(`${l} 字典文件存在`, false, "import 失败");
    }
  }
}

console.log("\n[3e] legacy 商品库召回层（39.6 万对方资产：商品召回 + 以货带厂直挂严选厂）");
{
  const db = await getDb();
  const total: any = await db.execute(sql`SELECT COUNT(*) AS c FROM legacy_products`);
  const cnt = Number(total?.[0]?.[0]?.c ?? total?.[0]?.c ?? 0);
  check("legacy_products 全量在库（396,445）", cnt === 396445, `${cnt}`);
  const img: any = await db.execute(sql`SELECT COUNT(*) AS c FROM legacy_products WHERE image IS NOT NULL AND image != ''`);
  const ic = Number(img?.[0]?.[0]?.c ?? img?.[0]?.c ?? 0);
  check("image 字段已回填（>30 万有图）", ic > 300000, `${ic}`);

  const { legacySearchItems, legacyLinkedFactories } = await import("../api/sourcing/offerService");
  const items = await legacySearchItems("饭盒", 8);
  check("legacy 商品召回非空、价格正常、有图", items.length >= 3 && items.every((i) => i.price > 0.01 && i.price < 50000 && !!i.image), `${items.length} 条`);
  check("legacy 召回销量口径=0（档案库无销量，不编造）", items.length > 0 && items.every((i) => i.sales === 0), "sales=0");

  const linked = await legacyLinkedFactories("饭盒", 3);
  if (!linked.length) check("legacy 以货带厂命中严选厂", false, "0 命中");
  else {
    const ids = linked.map((l) => l.factory.id);
    const fr: any = await db.execute(sql`SELECT COUNT(*) AS c FROM factories WHERE id IN (${sql.join(ids.map((i) => sql`${i}`), sql`,`)}) AND is_trader = 0 AND dup_of IS NULL`);
    const fc = Number(fr?.[0]?.[0]?.c ?? fr?.[0]?.c ?? 0);
    check("legacy 以货带厂全部命中严选库在册厂（非贸易商/未去重）", fc === linked.length, `${fc}/${linked.length}`);
  }
}

console.log("\n[3b] 追问卡四场景");
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
  // 2026-11-06 旧权威库合并后 7,738 家；2026-11-07 品类补库试点 +944（灯饰379/文具358/汽用207，source=wbpilot_v1）
  // 口径改"只增不减"：补库是常态运营动作，总数只能涨不能跌，跌破 7,738 才是事故
  check("严选库 ≥ 7,738 家（只增不减）", Number(fac[0].c) >= 7738, `实际 ${fac[0].c}`);
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
  // 2026-11-09 iframe 预览修复：cookie 会被浏览器第三方策略拦截，token 必须双通道下发+可用
  const bearerToken = login.json?.result?.data?.json?.token;
  check("登录响应体回 token（双通道）", typeof bearerToken === "string" && bearerToken.length === 64);
  const meBearer = await fetch(`${BASE}/api/trpc/auth.me`, { headers: { Authorization: `Bearer ${bearerToken}` }, signal: AbortSignal.timeout(30_000) });
  const meBearerJson: any = await meBearer.json().catch(() => null);
  check("Bearer 头可认证（无 cookie 场景）", meBearerJson?.result?.data?.json?.email === em);
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

console.log("\n[8] 质检双检（2026-11-09 PRD v1.1）：表结构 + 鉴权边界（判卷不碰凭证，ops 凭证永不进 git）");
{
  const db = getDb();
  // 表存在且有 e2e 产物（人工全流程已通过：上传→提交→判定→签章→PDF）
  const [t1]: any = await db.execute(sql`SHOW TABLES LIKE 'inspection_reports'`);
  const [t2]: any = await db.execute(sql`SHOW TABLES LIKE 'inspection_evidences'`);
  check("inspection_reports / inspection_evidences 表存在", t1.length === 1 && t2.length === 1);
  const [cols]: any = await db.execute(sql`SHOW COLUMNS FROM orders LIKE 'status'`);
  check("orders.status 枚举含双检新态", typeof cols[0]?.Type === "string" && cols[0].Type.includes("insp1_passed") && cols[0].Type.includes("dispatched"));
  const [rep]: any = await db.execute(sql`SELECT COUNT(*) AS c FROM inspection_reports`);
  check("已有质检报告落库（e2e 产物）", Number(rep[0].c) >= 1, `${rep[0].c} 份`);

  // 鉴权边界（全部不需要凭证）
  const badTok = await fetch(`${BASE}/api/trpc/inspection.byToken?input=${encodeURIComponent(JSON.stringify({ json: { token: "badtoken1234567890" } }))}`);
  const badTokJson: any = await badTok.json();
  check("错 token 读上传页返回 null（不暴露报告是否存在）", badTokJson?.result?.data?.json === null);

  const upNoFile = await fetch(`${BASE}/api/qc/upload`, { method: "POST", body: new FormData() });
  check("上传缺参数被拒（400）", upNoFile.status === 400);

  const badUp = await fetch(`${BASE}/api/qc/upload`, {
    method: "POST",
    body: (() => { const f = new FormData(); f.append("token", "badtoken1234567890"); f.append("itemCode", "appearance"); f.append("file", new Blob(["x"], { type: "image/jpeg" }), "x.jpg"); return f; })(),
  });
  check("错 token 上传被拒（403）", badUp.status === 403);

  const anonFile = await fetch(`${BASE}/api/qc/file/1`);
  check("匿名访问证据文件被拒（403）", anonFile.status === 403);

  const anonPdf = await fetch(`${BASE}/api/qc/1/pdf`);
  check("匿名访问报告 PDF 被拒（403）", anonPdf.status === 403);

  const noSess = await fetch(`${BASE}/api/trpc/inspection.review`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ json: { reportId: 1, verdict: "pass" } }),
  });
  const noSessJson: any = await noSess.json();
  check("无会话调判定接口被拒（UNAUTHORIZED）", noSessJson?.error?.json?.data?.code === "UNAUTHORIZED");

  const noSessList = await fetch(`${BASE}/api/trpc/inspection.listMine?input=${encodeURIComponent(JSON.stringify({ json: { orderId: 1 } }))}`);
  const noSessListJson: any = await noSessList.json();
  check("无会话查买家报告被拒（UNAUTHORIZED）", noSessListJson?.error?.json?.data?.code === "UNAUTHORIZED");
}

// [收官] 多语言零残留巡检（罗总 2026-11-11 指令：专业机器巡检取代肉眼）：en/es/fr/pt × 6 核心页全量扫描，
// 巡检器=预热器+判官一体（首扫触发缓存补缺，45s 后重扫判定），有残留即 FAIL——不存版本。
{
  console.log("\n[收官] 多语言零残留巡检（5 语言 × 6 页，含预热重扫，约 5-10 分钟）");
  const { execFileSync } = await import("child_process");
  try {
    execFileSync("npx", ["tsx", "db/i18n-scan.ts"], {
      stdio: "inherit",
      timeout: 1_200_000,
      env: { ...process.env, SCAN_BASE: BASE },
    });
    check("i18n 五语言六页零中文残留", true);
  } catch {
    check("i18n 五语言六页零中文残留", false, "巡检器退出码非 0（详见上方扫描输出）");
  }
}

// [自清场] 判卷产生的 qa- 测试账号全链路删除（2026-11-11 M5 起：经营台账与驾驶舱只装真实数据，
// 测试数据跑完即清——40 张假订单 $105k 假 GMV 的教训，不可再犯）。
{
  const { getDb } = await import("../api/queries/connection");
  const db2 = getDb();
  const [ids]: any = await db2.execute(sql`SELECT id FROM users WHERE email LIKE 'qa-%@sourcbuy.test'`);
  const uidList = ids.map((r: any) => Number(r.id));
  if (uidList.length) {
    const idList = uidList.join(",");
    const rm = (s: string) => db2.execute(sql.raw(s));
    await rm(`DELETE FROM chat_messages WHERE thread_id IN (SELECT id FROM (SELECT id FROM chat_threads WHERE user_id IN (${idList})) t)`);
    await rm(`DELETE FROM chat_threads WHERE user_id IN (${idList})`);
    await rm(`DELETE FROM order_events WHERE order_id IN (SELECT id FROM (SELECT id FROM orders WHERE user_id IN (${idList})) o)`);
    await rm(`DELETE FROM orders WHERE user_id IN (${idList})`);
    await rm(`DELETE FROM addresses WHERE user_id IN (${idList})`);
    await rm(`DELETE FROM notifications WHERE user_id IN (${idList})`);
    await rm(`DELETE FROM recommendation_logs WHERE user_id IN (${idList})`);
    await rm(`DELETE FROM buyer_profiles WHERE user_id IN (${idList})`);
    await rm(`DELETE FROM sourcing_sessions WHERE user_id IN (${idList})`);
    await rm(`DELETE FROM auth_sessions WHERE user_id IN (${idList})`);
    await rm(`DELETE FROM analytics_events WHERE user_id IN (${idList})`);
    await rm(`DELETE FROM users WHERE id IN (${idList})`);
    console.log(`[自清场] 已删除 qa- 测试账号 ${uidList.length} 个及其关联数据`);
  }
}

console.log(`\n═══ 验收结果：${pass} PASS / ${fail} FAIL ═══`);
if (fail) { console.log("失败项：", fails.join(" | ")); process.exit(1); }
console.log("检查单全过，允许存版本。");
process.exit(0);
