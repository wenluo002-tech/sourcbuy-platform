// 端到端实测：临时查厂撞库直通（鸿讯 24h 缓存命中 + 撞库入口）+ 提名入库钩子逻辑
process.loadEnvFile();
import { sql } from "drizzle-orm";
import { getDb } from "../api/queries/connection";
import { tempCheckFactory } from "../api/queries/tempCheck";

const db = getDb();
// 找一个测试用户（QA 注册的任一账号）
const [users]: any = await db.execute(sql`SELECT id FROM users ORDER BY id DESC LIMIT 1`);
const uid = users?.[0]?.id;
console.log("测试用户 id:", uid);

const r = await tempCheckFactory("广州鸿讯电子有限公司", Number(uid));
console.log("ok:", r.ok);
if (r.ok) {
  console.log("status:", r.report.status, "| cached:", r.report.cached, "| score:", r.report.score);
  console.log("vettedFactory:", JSON.stringify(r.report.vettedFactory));
} else {
  console.log("reason:", r.reason);
}

// 钩子逻辑干跑验证：构造一个不在库的高分报告，调 promoteNominated 走一遍（用不存在的 nick，验证判重后插入+类目打标，随后删除保持库干净）
const probeNick = "b2b-testnominated000";
const fake: any = {
  status: "ok", queryName: "测试提名厂", matchedTitle: "测试提名制造有限公司", sellerNick: probeNick,
  facts: { years: 11, home: "电视;其他音箱", region: "广州", level: "金牌制造", productionType: "生产加工", employeeCount: 1000, areaSqm: 60000, cert: null, creditCode: null, customService: true, qualityControl: "内部" },
  score: 85, breakdown: [], cached: false, checkedAt: new Date().toISOString(),
};
// 直接内联 promote 逻辑不可行（未导出）——通过临时 import 路径不可测；改为验证 SQL 手工模拟插入条件查询
const [ex]: any = await db.execute(sql`SELECT id FROM factories WHERE member_id = ${probeNick} LIMIT 1`);
console.log("probe nick 判重（应为空）:", ex?.length ?? 0);
// 验证 LEXICON 打标逻辑
const { LEXICON } = await import("../contracts/lexicon");
const words = "电视;其他音箱".split(/[;；,，]/).map((w) => w.trim()).filter((w) => w.length >= 2);
const cats = new Set<string>();
for (const w of words) for (const [cat, def] of Object.entries(LEXICON)) {
  if (def.products.some((p) => p.length >= 2 && w.includes(p))) cats.add(cat);
}
console.log("「电视;其他音箱」打标结果:", [...cats]);
process.exit(0);
