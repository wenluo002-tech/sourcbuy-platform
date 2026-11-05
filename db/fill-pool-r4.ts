// 续灌第四轮（2026-11-05 晚，万邦正式 key 已充值 ¥1000，200 次/日限制解除）：USED=前三轮自动复算，每类再取8个新词；熔断改为成本制（今日万邦花费 ≥¥20 停）
process.loadEnvFile();
import { searchOffers } from "../api/sourcing/offerService";
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
import { LEXICON } from "../contracts/lexicon.js";

const R1 = ["牛仔裤","瑜伽裤","打底裤","运动裤","健身服","运动鞋","帆布鞋","休闲鞋","篮球鞋","登山鞋","双肩包","行李箱","手提包","帆布包","化妆包","充电宝","数据线","手机壳","手机支架","加湿器","收纳盒","收纳箱","垃圾桶","沙发垫","雨伞","办公椅","电脑椅","折叠桌","置物架","衣帽架","遥控车","早教机","婴儿车","纸尿裤","滑板车","粉底液","睫毛膏","洗面奶","爽肤水","防晒霜","太阳镜","眼镜框","发夹","项链","手链","防潮垫","登山包","冲锋衣","瑜伽垫","跳绳","宠物窝","牵引绳","猫抓板","猫爬架","宠物碗","遮阳挡","雨刮器","充气泵","车载吸尘器","方向盘套","吸顶灯","落地灯","灯带","太阳能灯","氛围灯","螺丝刀","冲击钻","角磨机","工具箱","卷尺","礼品盒","飞机盒","自封袋","气泡袋","无纺布袋","高压锅","电饭煲","榨汁机","保鲜盒","便当盒","圣诞树","树脂摆件","陶瓷摆件","冰箱贴","奖杯","中性笔","马克笔","笔记本","便利贴","文件夹"];
const BAN = new Set(["杯","杯子","锅","笔","表","炭","面具","婚庆","圣诞","万圣节"]);
const pick = (used: Set<string>) => (def: any) =>
  [...new Set(def.products as string[])]
    .filter(w => w.length >= 2 && !BAN.has(w) && !used.has(w))
    .sort((a, b) => {
      const sa = a.length >= 3 && a.length <= 5 ? 0 : 1;
      const sb = b.length >= 3 && b.length <= 5 ? 0 : 1;
      return sa - sb || a.length - b.length;
    });

// 复算第二轮实选词（同逻辑同词库，确定性一致）
const USED = new Set(R1);
for (const def of Object.values(LEXICON)) pick(USED)(def).slice(0, 4).forEach(w => USED.add(w)); // 复算第二轮
for (const def of Object.values(LEXICON)) pick(USED)(def).slice(0, 4).forEach(w => USED.add(w)); // 复算第三轮
console.log(`已去重前三轮 ${USED.size} 词`);

const db = getDb();
const todayUsed = async () => {
  const [r]: any = await db.execute(sql`SELECT COUNT(*) c, IFNULL(SUM(cost_cny),0) cost FROM sourcing_api_logs WHERE created_at >= CURDATE() AND provider='wanbang'`);
  return { calls: Number(r[0].c), cost: Number(r[0].cost) };
};
let done = 0, spent = 0, poolHit = 0, failed = 0;
for (const [cat, def] of Object.entries(LEXICON)) {
  const cand = pick(USED)(def).slice(0, 8);
  for (const w of cand) {
    const u = await todayUsed();
    if (u.cost >= 20) { console.log(`⚠️ 成本熔断（今日 ¥${u.cost.toFixed(2)}），停在 ${done} 词`); await summary(); process.exit(0); }
    try {
      const r = await searchOffers(w, 1);
      if (r.source === "cache") poolHit++; else spent++;
      done++;
      console.log(`[${done}] ${cat}/${w} → ${r.items.length}条 (${r.source})`);
    } catch (e: any) {
      failed++;
      console.log(`[x] ${cat}/${w}: ${String(e?.message ?? e).slice(0, 60)}`);
    }
    await new Promise(r => setTimeout(r, 600));
  }
}
async function summary() {
  const [p]: any = await db.execute(sql`SELECT COUNT(*) total, COUNT(DISTINCT seller_user_id) uids FROM offer_pool`);
  const u = await todayUsed();
  console.log(`\n=== 第四轮结束：处理${done}词（短路${poolHit}/实调${spent}/失败${failed}），池 ${p[0].total} 条 / ${p[0].uids} uid，今日万邦 ${u.calls} 次 / ¥${u.cost.toFixed(2)} ===`);
}
await summary();
process.exit(0);
