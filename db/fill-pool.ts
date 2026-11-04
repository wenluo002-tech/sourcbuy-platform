// 品类词批量灌池：85词 × searchOffers（自带 缓存→池→万邦+回填 防重链路）
process.loadEnvFile();
import { searchOffers } from "../api/sourcing/offerService";
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";

const WORDS: [string, string[]][] = [
  ["服装服饰", ["牛仔裤","瑜伽裤","打底裤","运动裤","健身服"]],
  ["鞋靴", ["运动鞋","帆布鞋","休闲鞋","篮球鞋","登山鞋"]],
  ["箱包皮具", ["双肩包","行李箱","手提包","帆布包","化妆包"]],
  ["电子数码", ["充电宝","数据线","手机壳","手机支架","加湿器"]],
  ["家居日用", ["收纳盒","收纳箱","垃圾桶","沙发垫","雨伞"]],
  ["家具", ["办公椅","电脑椅","折叠桌","置物架","衣帽架"]],
  ["玩具母婴", ["遥控车","早教机","婴儿车","纸尿裤","滑板车"]],
  ["美妆个护", ["粉底液","睫毛膏","洗面奶","爽肤水","防晒霜"]],
  ["饰品配件", ["太阳镜","眼镜框","发夹","项链","手链"]],
  ["户外运动", ["防潮垫","登山包","冲锋衣","瑜伽垫","跳绳"]],
  ["宠物用品", ["宠物窝","牵引绳","猫抓板","猫爬架","宠物碗"]],
  ["汽车用品", ["遮阳挡","雨刮器","充气泵","车载吸尘器","方向盘套"]],
  ["灯饰照明", ["吸顶灯","落地灯","灯带","太阳能灯","氛围灯"]],
  ["五金工具", ["螺丝刀","冲击钻","角磨机","工具箱","卷尺"]],
  ["包装印刷", ["礼品盒","飞机盒","自封袋","气泡袋","无纺布袋"]],
  ["厨房餐饮", ["高压锅","电饭煲","榨汁机","保鲜盒","便当盒"]],
  ["工艺礼品", ["圣诞树","树脂摆件","陶瓷摆件","冰箱贴","奖杯"]],
  ["文具办公", ["中性笔","马克笔","笔记本","便利贴","文件夹"]],
];

const db = getDb();
let apiCalls0 = 0;
{
  const [r]: any = await db.execute(sql`SELECT COUNT(*) c FROM sourcing_api_logs WHERE created_at >= CURDATE() AND endpoint='item_search'`);
  apiCalls0 = Number(r[0].c);
}
console.log(`起跑线：今日 item_search 已用 ${apiCalls0} 次，本次预算 ≤ ${200 - apiCalls0 - 10} 词`);

let done = 0, spent = 0, poolHit = 0, failed = 0, totalItems = 0;
const t0 = Date.now();
for (const [cat, words] of WORDS) {
  const used = await db.execute(sql`SELECT COUNT(*) c FROM sourcing_api_logs WHERE created_at >= CURDATE() AND endpoint='item_search'`) as any;
  const nowUsed = Number(used[0][0].c);
  if (nowUsed - apiCalls0 >= 90) { console.log(`⚠️ 达本次预算上限，停在 ${done} 词`); break; }
  for (const w of words) {
    try {
      const r = await searchOffers(w, 1);
      const n = r.items?.length ?? 0;
      totalItems += n;
      if (r.source === "cache") poolHit++; else spent++;
      done++;
      console.log(`[${done}] ${cat}/${w} → ${n}条 (${r.source})`);
    } catch (e: any) {
      failed++;
      console.log(`[x] ${cat}/${w} 失败: ${String(e?.message ?? e).slice(0, 80)}`);
    }
    await new Promise(r => setTimeout(r, 600)); // 限流
  }
}
const [after]: any = await db.execute(sql`SELECT COUNT(*) total, COUNT(DISTINCT seller_user_id) uids FROM offer_pool`);
const [cost]: any = await db.execute(sql`SELECT COUNT(*) c, SUM(cost_cny) cost FROM sourcing_api_logs WHERE created_at >= CURDATE() AND endpoint='item_search'`);
console.log(`\n=== 灌池完成 ${((Date.now()-t0)/1000/60).toFixed(1)}分钟 ===`);
console.log(`处理 ${done} 词（池短路 ${poolHit}，万邦实调 ${spent}，失败 ${failed}），累计返回 ${totalItems} 条`);
console.log(`今日 item_search 共 ${cost[0].c} 次 / ¥${cost[0].cost}`);
console.log(`池规模：${after[0].total} 条 / ${after[0].uids} 个卖家uid`);
process.exit(0);
