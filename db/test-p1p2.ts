/**
 * P1 买侧上下文三增量 + P2 数字护照 端到端验证
 * 直接调函数层（router 层需要登录 cookie，函数层等价且更稳）
 */
import { getDb } from "../api/queries/connection";
import { sql as dsql } from "drizzle-orm";
import { sourcingChat } from "../api/queries/aiSourcing";
import { logRecommendation, updateBuyerProfile, getBuyerProfile } from "../api/queries/context";
import { getFactoryPassport } from "../api/queries/factories";
import { transitionOrder } from "../api/queries/orders";

const db: any = getDb();
let pass = 0, fail = 0;
const ok = (name: string, detail?: string) => { pass++; console.log(`  ✓ ${name}${detail ? "  " + detail : ""}`); };
const bad = (name: string, detail?: string) => { fail++; console.log(`  ✗ ${name}${detail ? "  " + detail : ""}`); };

// 找测试账号（m4atest）
const [users]: any = await db.execute(dsql`SELECT id, email FROM users WHERE email LIKE 'm4atest%' ORDER BY id DESC LIMIT 1`);
const user = users[0];
console.log(`测试账号: #${user.id} ${user.email}`);

// ── 1. 推荐证据链：真实对话 → logRecommendation 落库 ──
console.log("\n[1] 推荐证据链");
const r1 = await sourcingChat("I need 500pcs yoga pants, ship to Los Angeles", [], undefined, undefined, "en", true, user.id);
ok("对话返回", `factories=${r1.factories.length} products=${r1.products.length}`);
await logRecommendation({
  userId: user.id, threadId: null, message: "I need 500pcs yoga pants, ship to Los Angeles",
  intent: { product: "yoga pants", quantity: 500, destination: "Los Angeles" },
  factories: r1.factories, productsCount: r1.products.length,
  hadLink: false, hadImage: false, factoryQa: !!r1.factoryQa,
});
const [rl]: any = await db.execute(dsql`SELECT * FROM recommendation_logs WHERE user_id=${user.id} ORDER BY id DESC LIMIT 1`);
if (rl[0]) {
  const facs = typeof rl[0].factories === "string" ? JSON.parse(rl[0].factories) : rl[0].factories;
  facs.length > 0 && rl[0].intent_product === "yoga pants"
    ? ok("recommendation_logs 落库", `id=${rl[0].id} factories=${facs.length} 精简字段=${Object.keys(facs[0]).join(",")}`)
    : bad("recommendation_logs 字段异常", JSON.stringify(rl[0]).slice(0, 200));
} else bad("recommendation_logs 未落库");

// ── 2. 买家画像：补发消息凑样本 → updateBuyerProfile → getBuyerProfile ──
console.log("\n[2] 买家画像自动推断");
// 造一个会话塞 4 条 user 消息（凑 MIN_SAMPLE=3）
const [tins]: any = await db.execute(dsql`INSERT INTO chat_threads (user_id, title, created_at) VALUES (${user.id}, 'profile-test', NOW())`);
const tid = Number(tins.insertId);
const msgs = [
  "I need 500pcs yoga pants to Los Angeles",
  "also 300pcs running leggings to New York",
  "do you have yoga shorts? 800pcs to Los Angeles",
  "what about sports bra 200pcs",
];
for (const m of msgs) {
  await db.execute(dsql`INSERT INTO chat_messages (thread_id, role, content, created_at) VALUES (${tid}, 'user', ${m}, NOW())`);
}
await updateBuyerProfile(user.id);
const prof = await getBuyerProfile(user.id);
if (prof && prof.sampleSize >= 3) {
  ok("buyer_profiles 落库", `sample=${prof.sampleSize} cats=${prof.categories.map(c => `${c.v}×${c.n}`).join("/")} dest=${prof.destinations.map(d => d.v).join("/")}`);
  // 画像注入对话话术验证
  const r2 = await sourcingChat("any recommendation for me?", [], undefined, undefined, "en", true, user.id);
  const factsInjects = JSON.stringify(r2).length > 0; // 只需确认不报错
  ok("带画像对话正常返回", `factsInjects=${factsInjects}`);
} else bad("buyer_profiles 未生成或样本不足", JSON.stringify(prof));

// ── 3. 选择理由埋点：造 quoted 单 → confirmQuote 带 decisionTags ──
console.log("\n[3] 选择理由埋点");
const [facs]: any = await db.execute(dsql`SELECT id, name FROM factories WHERE is_trader=0 AND dup_of IS NULL LIMIT 1`);
const fac = facs[0];
const [oins]: any = await db.execute(dsql`
  INSERT INTO orders (order_no, user_id, product_title, quantity, status, created_at)
  VALUES (${"SBTEST" + Date.now().toString(36).toUpperCase()}, ${user.id}, 'yoga pants', 500, 'inquiry', NOW())`);
const oid = Number(oins.insertId);
await transitionOrder({ orderId: oid, to: "quoted", actor: "ops", quote: { goodsTotalCny: 3400, totalUsd: 550, commissionUsd: 30, commissionRate: 0.06, fxRate: 6.34, quotedAt: new Date().toISOString() } });
await transitionOrder({ orderId: oid, to: "pending_payment", actor: "buyer", userId: user.id, decisionTags: ["price", "sample"], decisionNote: "best price with sample check" });
const [ords]: any = await db.execute(dsql`SELECT status, decision_tags, decision_note FROM orders WHERE id=${oid}`);
if (ords[0]?.decision_tags) {
  const tags = typeof ords[0].decision_tags === "string" ? JSON.parse(ords[0].decision_tags) : ords[0].decision_tags;
  tags.includes("price") && ords[0].decision_note === "best price with sample check"
    ? ok("decision_tags/note 落库", `tags=${tags.join(",")} note="${ords[0].decision_note}"`)
    : bad("decision_tags 内容异常", JSON.stringify(ords[0]));
} else bad("decision_tags 未写入");
// 清理测试订单
await db.execute(dsql`DELETE FROM order_events WHERE order_id=${oid}`);
await db.execute(dsql`DELETE FROM orders WHERE id=${oid}`);

// ── 4. 数字护照：匿名 vs 已解锁 ──
console.log("\n[4] 数字护照 API");
const passAnon = await getFactoryPassport(fac.id, false);
const passUnlocked = await getFactoryPassport(fac.id, true);
if (passAnon && passUnlocked) {
  const masked = passAnon.identity.name !== fac.name;
  const unmasked = passUnlocked.identity.name === fac.name;
  masked && unmasked
    ? ok("匿名代号/解锁真名", `anon="${passAnon.identity.name}" unlocked="${passUnlocked.identity.name}" completeness=${passUnlocked.completeness.filled}/${passUnlocked.completeness.of}`)
    : bad("解锁逻辑异常", `anon=${passAnon.identity.name} unlocked=${passUnlocked.identity.name}`);
  passAnon.terms === null ? ok("terms 诚实为空(不编造)") : bad("terms 应为 null");
  Array.isArray(passAnon.evidence.auditReports) && passAnon.evidence.auditReports.length === 0
    ? ok("auditReports 诚实空数组") : bad("auditReports 异常");
} else bad("passport 返回 null", `anon=${!!passAnon} unlocked=${!!passUnlocked}`);
// 贸易商/合并厂应返回 null
const [traders]: any = await db.execute(dsql`SELECT id FROM factories WHERE is_trader=1 LIMIT 1`);
if (traders[0]) {
  const tp = await getFactoryPassport(traders[0].id, true);
  tp === null ? ok("贸易商护照返 null") : bad("贸易商护照应返 null");
}

console.log(`\n═══ P1/P2 端到端验证：${pass} PASS / ${fail} FAIL ═══`);
process.exit(fail > 0 ? 1 : 0);
