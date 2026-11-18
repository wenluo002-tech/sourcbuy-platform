/**
 * 探源状态机链路自测（P0 收尾，2026-11-18）——不花 TXGC 钱：
 * 1) 无产品词原话 → 建单即 failed/no_keyword（词条表安抚话术口径）
 * 2) escalateToHuman：failed→verifying 放行 + 事件留痕
 * 3) 非 failed 单 escalate → 拒绝（"not_failed" 语义，路由层同闸）
 * 4) 连建两单验 request_no 当日序号唯一递增
 * 跑完清理测试单（Demo 数据保持干净）。
 */
import { getDb } from "../api/queries/connection";
import { sql as dsql } from "drizzle-orm";
import { recordGap } from "../api/queries/gapRadar";
import { escalateToHuman, getSourcingRequestView, createSourcingRequest } from "../api/lib/sourcingRequest";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`, extra ?? ""); }
}

const ids: number[] = [];
async function main() {
  const db = getDb();

  // 1) 无产品词 → no_keyword 失败兜底
  const id1 = await recordGap("帮我看看这个东西靠不靠谱", "zh", null);
  ok("recordGap 返回单 id", typeof id1 === "number" && id1 > 0, id1);
  if (id1) ids.push(id1);
  const v1 = id1 ? await getSourcingRequestView(id1, null) : null;
  ok("状态=failed 且原因码 no_keyword", v1?.status === "failed" && v1?.failReason === "no_keyword", v1?.failReason);
  ok("events 留痕 received→failed", JSON.stringify(v1?.events.map((e) => e.stage)) === JSON.stringify(["received", "failed"]), v1?.events);

  // 2) 转人工：failed → verifying
  const esc1 = id1 ? await escalateToHuman(id1) : false;
  ok("escalate failed 单放行", esc1 === true);
  const v2 = id1 ? await getSourcingRequestView(id1, null) : null;
  ok("转人工后 status=verifying", v2?.status === "verifying", v2?.status);
  ok("事件留痕含『买家主动转人工』", v2?.events.some((e) => e.reason === "买家主动转人工") === true);

  // 3) 非 failed 单再 escalate → 拒绝
  const esc2 = id1 ? await escalateToHuman(id1) : true;
  ok("非 failed 单 escalate 拒绝", esc2 === false);

  // 4) 编号唯一递增
  const a = await createSourcingRequest({ userId: null, keyword: "测试编号A", locale: "zh" });
  const b = await createSourcingRequest({ userId: null, keyword: "测试编号B", locale: "zh" });
  ok("两单都建成", !!a && !!b);
  ok("编号不同且同日序号递增", !!a && !!b && a.requestNo !== b.requestNo && a.requestNo.slice(0, -3) === b.requestNo.slice(0, -3), [a?.requestNo, b?.requestNo]);
  if (a) ids.push(a.id);
  if (b) ids.push(b.id);

  // 属主校验：user_id 非空的单，别人读不到
  const c = await createSourcingRequest({ userId: 600001, keyword: "属主校验测试", locale: "zh" });
  if (c) ids.push(c.id);
  const vOther = c ? await getSourcingRequestView(c.id, 999999) : undefined;
  const vAnon = c ? await getSourcingRequestView(c.id, null) : undefined;
  const vOwner = c ? await getSourcingRequestView(c.id, 600001) : undefined;
  ok("他人读单被拒", vOther === null);
  ok("匿名读他单被拒", vAnon === null);
  ok("属主本人可读", !!vOwner);

  // 清理测试单（含 events；候选本测试不产生）
  for (const id of ids) {
    await db.execute(dsql`DELETE FROM sourcing_request_events WHERE request_id = ${id}`).catch(() => {});
    await db.execute(dsql`DELETE FROM sourcing_requests WHERE id = ${id}`).catch(() => {});
  }
  console.log(`\n清理测试单 ${ids.length} 张；结果 ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
