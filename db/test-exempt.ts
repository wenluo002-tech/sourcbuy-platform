// 一次性验收：ops 白名单账号（罗总测试号）生成报告免积分、不限次、失败不产生流水（2026-11-17 罗总拍板）
// 断言：白名单账号 → 请求报告 → company_not_found 快速失败 → 全程 0 条 redeem/refund 流水、余额不动
import "dotenv/config";
import { getDb } from "../api/queries/connection";
import { sql as dsql } from "drizzle-orm";
import { registerUser } from "../api/queries/auth";
import { requestReport } from "../api/queries/verification";
import { balanceOf, ledgerOf } from "../api/lib/points";

const EMAIL = "qa-exempt@sourcbuy.test";
process.env.OPS_ADMIN_EMAILS = `${process.env.OPS_ADMIN_EMAILS ?? ""},${EMAIL}`;
const db = getDb();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;

function check(name: string, cond: boolean, extra = "") {
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name} ${extra}`); }
}

const { user } = await registerUser(EMAIL, "Test1234!", "Exempt QA", "zh");
try {
  const balBefore = await balanceOf(user.id);
  check("注册礼到账 1000", balBefore === 1000, `bal=${balBefore}`);

  const { reportId } = await requestReport({ userId: user.id, email: EMAIL, companyName: "不存在测试公司有限公司" });
  check("免扣分直接建行", reportId > 0, `reportId=${reportId}`);

  let status = "generating";
  for (let i = 0; i < 45 && status === "generating"; i++) {
    await sleep(2000);
    const r: any = await db.execute(dsql`SELECT status FROM verification_reports WHERE id = ${reportId}`);
    status = r[0]?.[0]?.status ?? "missing";
  }
  check("管线快速失败（company_not_found）", status === "failed", `status=${status}`);

  const ledger = await ledgerOf(user.id);
  const reasons = ledger.map((r: any) => r.reason).sort().join(",");
  check("流水只有注册礼，无 redeem/refund", reasons === "register_gift", `reasons=${reasons}`);

  const balAfter = await balanceOf(user.id);
  check("失败前后余额不动（1000→1000）", balAfter === 1000, `bal=${balAfter}`);
} finally {
  await db.execute(dsql`DELETE FROM points_ledger WHERE user_id = ${user.id}`);
  await db.execute(dsql`DELETE FROM verification_reports WHERE user_id = ${user.id}`);
  await db.execute(dsql`DELETE FROM chat_messages WHERE thread_id IN (SELECT id FROM chat_threads WHERE user_id = ${user.id})`);
  await db.execute(dsql`DELETE FROM chat_threads WHERE user_id = ${user.id}`);
  await db.execute(dsql`DELETE FROM auth_sessions WHERE user_id = ${user.id}`);
  await db.execute(dsql`DELETE FROM users WHERE id = ${user.id}`);
}
console.log(`\n═══ 白名单免积分验收：${pass} PASS / ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
