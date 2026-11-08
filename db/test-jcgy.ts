// 建材工业试点桶端到端：问 316 立柱 → 应命中桶、推出真实厂、manualQuote=true、话术含人工核价口径
process.loadEnvFile();
import { sourcingChat } from "../api/queries/aiSourcing";
import { expandQuery } from "../contracts/lexicon";

// 词库单测
const cases: Array<[string, string | null]> = [
  ["316不锈钢立柱", "建材工业"],
  ["铝扶手", "建材工业"],
  ["钢化玻璃幕墙", "建材工业"],
  ["玻璃杯", null],          // 歧义词守卫：不得误入建材桶
  ["瑜伽裤", "服装服饰"],      // 既有桶回归
  ["球阀", "建材工业"],
];
let pass = 0, fail = 0;
for (const [q, want] of cases) {
  const got = expandQuery(q).category;
  const okk = got === want;
  okk ? pass++ : fail++;
  console.log(`${okk ? "✓" : "✗"} expandQuery("${q}") = ${got}（期望 ${want}）`);
}

// 真实对话
console.log("\n=== 真实对话：建材询价 ===");
const r = await sourcingChat("我需要 316 不锈钢立柱 200 根，发到洛杉矶", [], undefined, undefined, "zh", false, null);
console.log("manualQuote:", (r as any).manualQuote);
console.log("factories:", r.factories.length, "家");
if (r.factories[0]) console.log("top1:", r.factories[0].name, r.factories[0].tier, r.factories[0].score);
console.log("reply:", r.reply.slice(0, 300));
const hasManual = /人工|48/.test(r.reply);
const noRate = !/3\.5%|11%|费率|佣金比例/.test(r.reply);
console.log(`话术含人工核价口径: ${hasManual ? "✓" : "✗"}；未引用费率数字: ${noRate ? "✓" : "✗"}`);
hasManual && noRate ? pass++ : fail++;

console.log("\n=== 英文回归 ===");
const r2 = await sourcingChat("I need 500pcs glass railing for a hotel project, ship to Sydney", [], undefined, undefined, "en", false, null);
console.log("manualQuote:", (r2 as any).manualQuote, "| factories:", r2.factories.length);
console.log("reply:", r2.reply.slice(0, 250));
/48|manual/i.test(r2.reply) ? pass++ : fail++;

console.log(`\n═══ 建材桶验证：${pass} PASS / ${fail} FAIL ═══`);
process.exit(fail > 0 ? 1 : 0);
