// P4 积分系统自测：注册礼/测试号豁免/兑换/退分/重放幂等/负挂账
process.loadEnvFile();
import { awardRegisterGift, awardOrderPayment, clawbackRefund, balanceOf, redeemForReport, refundReport, ledgerOf } from "../api/lib/points";
import { getDb } from "../api/queries/connection";
import { sql as dsql } from "drizzle-orm";

const UID = 999000001; // 虚拟 user_id，测完清理
async function main() {
  const db = getDb();
  let pass = 0, fail = 0;
  const ok = (name: string, cond: boolean) => { cond ? pass++ : fail++; console.log(cond ? "PASS" : "FAIL", name); };

  // 测试号不发注册礼
  await awardRegisterGift(UID, "qa999@test.com");
  ok("测试号不计分", (await balanceOf(UID)) === 0);

  // 正常注册礼 + 重放幂等
  await awardRegisterGift(UID, "buyer@example.com");
  await awardRegisterGift(UID, "buyer@example.com"); // 重放
  ok("注册礼 1000 且重放不翻倍", (await balanceOf(UID)) === 1000);

  // 支付积分 + 重放
  await awardOrderPayment({ userId: UID, orderId: 99001, paidUsd: 1234.56 });
  await awardOrderPayment({ userId: UID, orderId: 99001, paidUsd: 1234.56 });
  ok("支付 $1234.56→1234 分且幂等", (await balanceOf(UID)) === 2234);

  // 兑换报告 + 重放（同 reportId 不重复扣）
  ok("首次兑换 ok", (await redeemForReport(UID, 99001)) === "ok");
  await redeemForReport(UID, 99001);
  ok("兑换 -1000 且幂等", (await balanceOf(UID)) === 1234);

  // 失败退分 + 重放
  await refundReport(UID, 99001);
  await refundReport(UID, 99001);
  ok("退分 +1000 且幂等", (await balanceOf(UID)) === 2234);

  // 退款扣回（负挂账路径：扣到负数也允许）
  await clawbackRefund({ userId: UID, orderId: 99001, refundUsd: 3000 });
  ok("退款扣回 -3000 → 负挂账 -766", (await balanceOf(UID)) === -766);

  // 余额不足兑换
  ok("余额不足 not_enough", (await redeemForReport(UID, 99002)) === "not_enough");

  const rows = await ledgerOf(UID);
  ok("流水 5 条全留痕（测试号已跳过）", rows.length === 5);

  await db.execute(dsql`DELETE FROM points_ledger WHERE user_id = ${UID}`);
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
