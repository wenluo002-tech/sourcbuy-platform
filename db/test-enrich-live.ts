// 实测"问到即采"：挑一家缺字段的厂跑 enrichFactoryLive，验证写库+台账+节流
import { getDb } from "../api/queries/connection";
import { sql as dsql } from "drizzle-orm";
import { enrichFactoryLive } from "../api/queries/shopEnrich";

const main = async () => {
  const db = await getDb();
  // 找一家有 sid 但缺 employee_count/area_sqm 的厂
  const [rows]: any = await db.execute(dsql`
    SELECT id, name, member_id, employee_count, area_sqm, years, cert, shopinfo_checked_at
    FROM factories
    WHERE member_id IS NOT NULL AND member_id != ''
      AND (member_id LIKE 'b2b-%' OR member_id REGEXP '^[a-z0-9_]{3,32}$')
      AND (employee_count IS NULL OR employee_count = 0 OR area_sqm IS NULL OR area_sqm = 0)
      AND (shopinfo_checked_at IS NULL OR shopinfo_checked_at < NOW() - INTERVAL 24 HOUR)
    ORDER BY id LIMIT 3
  `);
  console.log("候选厂:", JSON.stringify(rows, null, 1));
  if (!rows?.length) { console.log("无缺字段候选"); process.exit(0); }
  const target = rows[0];
  console.log(`\n=== 实测 enrichFactoryLive(#${target.id} ${target.name}) ===`);
  const t0 = Date.now();
  const r = await enrichFactoryLive(Number(target.id));
  console.log(`耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s 结果:`, r);
  const [after]: any = await db.execute(dsql`
    SELECT id, employee_count, area_sqm, years, cert, oem_mode, shopinfo_checked_at FROM factories WHERE id = ${target.id}
  `);
  console.log("补查后档案:", JSON.stringify(after?.[0]));
  // 节流验证：立即再调一次应返回 fresh
  const r2 = await enrichFactoryLive(Number(target.id));
  console.log("节流验证(应 fresh):", r2);
  // 台账验证
  const [log2]: any = await db.execute(dsql`
    SELECT endpoint, cost_cny, ok, error FROM sourcing_api_logs
    WHERE provider='wanbang' AND endpoint LIKE '%:live' ORDER BY id DESC LIMIT 4
  `);
  console.log("台账:", JSON.stringify(log2, null, 1));
  process.exit(0);
};
main().catch((e) => { console.error(e); process.exit(1); });
