import { getDb } from "../api/queries/connection";
import {
  factories,
  factoryScores,
  commissionRules,
  categoryRiskTiers,
} from "./schema";
import * as fs from "fs";

// 数据源：严选工厂数据库备份（2026-11-01 从 workbuddy.host 全量抢救）
const FACTORIES_JSON =
  "/mnt/agents/output/严选工厂数据库备份/factories.json";

// 费率矩阵 v1.0（2026-11-01 业务负责人冻结）：品类风险档 × 金额阶梯（USD）
const FEE_MATRIX: Array<[string, number, number | null, number]> = [
  // [riskTier, amountFrom, amountTo, rate]
  ["A", 0, 2000, 0.08],
  ["A", 2000, 10000, 0.06],
  ["A", 10000, 50000, 0.05],
  ["A", 50000, null, 0.035],
  ["B", 0, 2000, 0.09],
  ["B", 2000, 10000, 0.07],
  ["B", 10000, 50000, 0.06],
  ["B", 50000, null, 0.045],
  ["C", 0, 2000, 0.11],
  ["C", 2000, 10000, 0.09],
  ["C", 10000, 50000, 0.07],
  ["C", 50000, null, 0.05],
];

const RISK_TIERS: Array<[string, string, string]> = [
  ["服饰鞋帽", "A", "低风险标品：质检简单，认证要求少"],
  ["日用百货", "A", "低风险标品"],
  ["文具办公", "A", "低风险标品"],
  ["布艺家纺", "A", "低风险标品"],
  ["家居用品", "B", "中风险：需功能检测"],
  ["小家电", "B", "中风险：CE/FCC 认证"],
  ["玩具", "B", "中风险：EN71/ASTM 认证"],
  ["五金工具", "B", "中风险"],
  ["消费电子", "C", "高风险：认证复杂、带电"],
  ["化妆品个护", "C", "高风险：FDA/CPNP 合规"],
  ["儿童用品", "C", "高风险：CPC/EN71 强制认证"],
  ["食品接触类", "C", "高风险：FDA/LFGB"],
];

async function seed() {
  const db = getDb();
  console.log("Seeding database...");

  // 幂等：已导入则跳过
  const existing = await db.select({ id: factories.id }).from(factories).limit(1);
  if (existing.length) {
    console.log("already seeded, skip.");
    process.exit(0);
  }

  // 1) 佣金规则（幂等）
  const cr = await db.select({ id: commissionRules.id }).from(commissionRules).limit(1);
  if (!cr.length) {
    await db.insert(commissionRules).values(
      FEE_MATRIX.map(([riskTier, amountFrom, amountTo, rate]) => ({
        version: "v1.0",
        riskTier: riskTier as "A" | "B" | "C",
        amountFrom: String(amountFrom),
        amountTo: amountTo === null ? null : String(amountTo),
        rate: String(rate),
        minFee: "50.00",
      }))
    );
    console.log(`commission_rules: ${FEE_MATRIX.length} rows`);
  } else console.log("commission_rules: skip (exists)");

  // 2) 品类风险档（幂等）
  const ct = await db.select({ id: categoryRiskTiers.id }).from(categoryRiskTiers).limit(1);
  if (!ct.length) {
    await db.insert(categoryRiskTiers).values(
      RISK_TIERS.map(([categoryName, riskTier, note]) => ({
        categoryName,
        riskTier: riskTier as "A" | "B" | "C",
        note,
      }))
    );
    console.log(`category_risk_tiers: ${RISK_TIERS.length} rows`);
  } else console.log("category_risk_tiers: skip (exists)");

  // 3) 工厂数据（分批插入）
  const raw = JSON.parse(fs.readFileSync(FACTORIES_JSON, "utf-8")) as any[];
  console.log(`factories.json loaded: ${raw.length} factories`);

  const BATCH = 200;
  let inserted = 0;
  for (let i = 0; i < raw.length; i += BATCH) {
    const batch = raw.slice(i, i + BATCH);
    await db.insert(factories).values(
      batch.map((f) => {
        const imgs = f.images || {};
        const main =
          imgs.gate?.[0] || imgs.workshop?.[0] || imgs.warehouse?.[0] || null;
        return {
          memberId: String(f.memberId ?? f.slug ?? `idx-${i}`),
          slug: f.slug ?? null,
          name: String(f.name ?? "").slice(0, 255),
          location: f.location || null,
          province: f.province || null,
          city: f.city || null,
          district: f.district || null,
          years: f.years != null ? String(f.years) : null,
          score: f.score != null ? String(f.score) : null,
          tier: ["金标", "银标", "铜标", "优选", "培育"].includes(f.tier)
            ? f.tier
            : null,
          medal: f.medal || null,
          medalLevel: f.medalLevel || null,
          isSuper: !!f.super,
          isPower: !!f.power,
          cert: f.cert || null,
          certNote: f.certNote || null,
          employeeCount: f.employee_count ?? null,
          areaSqm: f.area_sqm ?? null,
          replyRate: f.reply_rate != null ? String(f.reply_rate) : null,
          repurchaseRate:
            f.repurchase_rate != null ? String(f.repurchase_rate) : null,
          monthlyBuyers: f.monthly_buyers ?? null,
          oemMode: f.oem_mode || null,
          productionType: f.production_type || null,
          serviceCapability: f.service_capability || null,
          productCount: f.product_count ?? null,
          home: f.home || null,
          mainImage: main,
          review: f.review || null,
          tags: Array.isArray(f.tags) ? f.tags : [],
        };
      })
    );
    inserted += batch.length;
    if (inserted % 1000 === 0) console.log(`  factories: ${inserted}`);
  }
  console.log(`factories done: ${inserted}`);

  // 4) 评分子分（按 memberId 回查 id）
  const all = await db
    .select({ id: factories.id, memberId: factories.memberId })
    .from(factories);
  const idByMember = new Map(all.map((r) => [r.memberId, r.id]));
  let sInserted = 0;
  for (let i = 0; i < raw.length; i += BATCH) {
    const batch = raw.slice(i, i + BATCH);
    const rows = batch
      .map((f) => {
        const fid = idByMember.get(String(f.memberId ?? f.slug ?? ""));
        if (!fid) return null;
        return {
          factoryId: fid,
          qualityCert:
            f.quality_cert_score != null ? String(f.quality_cert_score) : null,
          factoryPower:
            f.factory_power_score != null ? String(f.factory_power_score) : null,
          trustYears:
            f.trust_years_score != null ? String(f.trust_years_score) : null,
          repurchase:
            f.repurchase_score != null ? String(f.repurchase_score) : null,
          production:
            f.production_score != null ? String(f.production_score) : null,
          service: f.service_score != null ? String(f.service_score) : null,
          sales: f.sales_score != null ? String(f.sales_score) : null,
          composite:
            f.composite_score != null ? String(f.composite_score) : null,
          confidence: f.confidence || null,
        };
      })
      .filter(Boolean) as any[];
    if (rows.length) await db.insert(factoryScores).values(rows);
    sInserted += rows.length;
  }
  console.log(`factory_scores done: ${sInserted}`);
  console.log("Done.");
  process.exit(0);
}

seed();
