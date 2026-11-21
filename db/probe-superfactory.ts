// CO-001-4 探针：实证万邦 item_get_shop / sunclub offer 详情有无「超级工厂」等效字段
// 只打印字段名与命中的布尔/枚举值，不打印凭证、不打印完整 payload
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";

const SUNCLUB = process.env.SUNCLUB_BASE;
const WB_BASE = process.env.WANBANG_BASE ?? "https://api-gw.onebound.cn/1688";

async function wbCall(endpoint: string, params: Record<string, string>) {
  const qs = new URLSearchParams({ key: process.env.WANBANG_KEY!, secret: process.env.WANBANG_SECRET!, lang: "zh-CN", cache: "no", ...params });
  const res = await fetch(`${WB_BASE}/${endpoint}/?${qs}`, { signal: AbortSignal.timeout(30000) });
  return (await res.json()) as any;
}

function fieldPaths(obj: any, prefix = "", depth = 0, out: string[] = []): string[] {
  if (depth > 4 || obj === null || obj === undefined) return out;
  if (Array.isArray(obj)) { if (obj[0]) fieldPaths(obj[0], prefix + "[]", depth + 1, out); return out; }
  if (typeof obj === "object") { for (const k of Object.keys(obj)) fieldPaths(obj[k], prefix ? prefix + "." + k : k, depth + 1, out); return out; }
  const v = String(obj);
  out.push(`${prefix} = ${v.length <= 40 ? v : v.slice(0, 40) + "…"}`);
  return out;
}

const KEYWORD = /超级工厂|实力商家|实力工厂|superFactory|super_factory|factoryType|factory_type|strength|powerful|verified_factory|tpYear|tp_year|诚信通/i;

async function main() {
  const db = getDb();
  const [f] = (await db.execute(sql`SELECT member_id, name FROM factories WHERE member_id LIKE 'b2b-%' AND is_trader = 0 LIMIT 1`)) as any[];
  const [o] = (await db.execute(sql`SELECT offer_id FROM offer_pool WHERE seller_user_id IS NOT NULL LIMIT 1`)) as any[];
  const memberId: string | undefined = f[0]?.member_id;
  const offerId: string | undefined = o[0]?.offer_id;
  console.log(`样本: member_id=${memberId}, offer_id=${offerId}`);

  // ① 万邦 item_get_shop + seller_info
  if (memberId) {
    for (const ep of ["item_get_shop", "seller_info"]) {
      const t0 = Date.now();
      const shop = await wbCall(ep, { sid: memberId });
      const root = shop?.items?.item?.[0] ?? shop?.items ?? shop;
      const paths = fieldPaths(root, "");
      console.log(`\n=== 万邦 ${ep}（${Date.now() - t0}ms，error_code=${shop?.error_code}，${paths.length} 字段）===`);
      const hits = paths.filter((p) => KEYWORD.test(p));
      console.log(hits.length ? "★ 疑似命中:\n" + hits.join("\n") : "✗ 无超级工厂/实力商家等效字段");
      if (ep === "item_get_shop") console.log("\n全部字段:\n" + paths.slice(0, 120).join("\n"));
    }
  }

  // ② sunclub offer 详情
  if (SUNCLUB && offerId) {
    const t0 = Date.now();
    const r = await fetch(`${SUNCLUB}/api/alibabaformat/offER?OFFERID=${offerId}`, { signal: AbortSignal.timeout(15000) });
    const d = (await r.json()) as any;
    const paths = fieldPaths(d?.Data ?? {}, "");
    console.log(`\n=== sunclub offer 详情（${Date.now() - t0}ms，${paths.length} 字段）===`);
    const hits = paths.filter((p) => KEYWORD.test(p));
    console.log(hits.length ? "★ 疑似命中:\n" + hits.join("\n") : "✗ 无超级工厂/实力商家等效字段");
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
