/**
 * 智能客服"问到即采"：买家打听某家工厂底细而档案缺关键字段时，实时调万邦补查这一家。
 * 逻辑与 db/fill-shop-info.ts（已验证的批量回填器）完全同款：
 *   member_id 为钥匙；item_get_shop(深度档案) + seller_info(home/诚信通年限/精确员工数)；
 *   身份闸=返回 title 与库内厂名归一化全等才写；只填 NULL/0 空位；区间值取下限；评分列绝不写。
 * 差异：实时单厂、¥0.10/厂、同厂 24h 节流、当日万邦总费用 ¥150 熔断、任何失败静默降级。
 */
import { getDb } from "./connection";
import { sql as dsql } from "drizzle-orm";

const KEY = process.env.WANBANG_KEY || "";
const SECRET = process.env.WANBANG_SECRET || "";
const BASE = "https://api-gw.onebound.cn/1688";
const PRICE_ITEM_GET_SHOP = Number(process.env.PRICE_SHOP || 0.05);
const PRICE_SELLER_INFO = Number(process.env.PRICE_SELLER || 0.05);
const DAY_FUSE_CNY = 150; // 当日万邦总费用熔断线（与批量回填共享台账口径）
const THROTTLE_MS = 24 * 3600 * 1000; // 同厂 24h 只补一次

const norm = (s: string) =>
  (s ?? "").replace(/\s+/g, "").replace(/（/g, "(").replace(/）/g, ")").replace(/，/g, ",");

async function call(ep: string, sid: string): Promise<{ j: any; billed: boolean; ms: number }> {
  const t0 = Date.now();
  const qs = new URLSearchParams({ key: KEY, secret: SECRET, lang: "zh-CN", cache: "yes", sid });
  const res = await fetch(`${BASE}/${ep}/?${qs}`, { signal: AbortSignal.timeout(12000) });
  const j: any = await res.json();
  return { j, billed: j?.error_code === "0000", ms: Date.now() - t0 };
}

function parseDetail(detail: any): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(detail)) return out;
  for (const sec of detail) {
    for (const items of Object.values(sec ?? {})) {
      if (!Array.isArray(items)) continue;
      for (const it of items as any[]) {
        for (const [k, v] of Object.entries(it)) {
          const key = String(k).replace(/[:\s]+$/g, "").trim();
          if (key && v != null) out[key] = String(v).trim();
        }
      }
    }
  }
  return out;
}

const numFrom = (s: string | undefined): number | null => {
  const m = (s ?? "").replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
};
const lowerBound = numFrom; // 区间值("51 - 100 人")保守取下限

export interface EnrichResult {
  attempted: boolean;
  enriched: boolean;
  reason: string;
}

export async function enrichFactoryLive(factoryId: number): Promise<EnrichResult> {
  const no = (reason: string): EnrichResult => ({ attempted: false, enriched: false, reason });
  try {
    if (!KEY || !SECRET) return no("no_cred");
    const db: any = getDb();

    const [frows]: any = await db.execute(
      dsql`SELECT id, name, member_id, home, years, production_type, oem_mode, cert, cert_note, employee_count, area_sqm, service_capability, tags, shopinfo_checked_at FROM factories WHERE id = ${factoryId} LIMIT 1`,
    );
    const f = frows?.[0];
    if (!f) return no("not_found");

    // 24h 节流
    const checkedAt = f.shopinfo_checked_at ? new Date(f.shopinfo_checked_at) : null;
    if (checkedAt && Date.now() - checkedAt.getTime() < THROTTLE_MS) return no("fresh");

    // 当日熔断（全局台账）
    const [sp]: any = await db.execute(
      dsql`SELECT COALESCE(SUM(cost_cny),0) s FROM sourcing_api_logs WHERE provider='wanbang' AND DATE(created_at)=CURDATE()`,
    );
    if (Number(sp?.[0]?.s ?? 0) >= DAY_FUSE_CNY) return no("fuse");

    const sid = String(f.member_id ?? "");
    if (!sid || (!sid.startsWith("b2b-") && !/^[a-z0-9_]{3,32}$/i.test(sid))) return no("no_sid");

    const writes: Record<string, unknown> = {};
    let errMsg = "";
    let fcost = 0;
    let okShop = false;
    let okSeller = false;

    // ① item_get_shop：深度档案
    try {
      const r1 = await call("item_get_shop", sid);
      fcost += r1.billed ? PRICE_ITEM_GET_SHOP : 0;
      okShop = r1.billed;
      if (r1.j?.error_code === "5000") {
        errMsg = "notfound";
      } else if (r1.billed) {
        if (norm(r1.j?.title ?? "") !== norm(f.name)) {
          errMsg = `名称不符:${String(r1.j?.title ?? "").slice(0, 40)}`;
        } else {
          const d = parseDetail(r1.j.detail);
          if (!f.production_type && d["经营模式"]) writes.production_type = d["经营模式"];
          if (!f.oem_mode && d["加工方式"]) {
            const oem = d["加工方式"].split(/[;；]/).map((s) => s.trim()).filter(Boolean);
            if (oem.length) writes.oem_mode = oem.join("/");
          }
          if ((!f.cert || f.cert === "") && d["管理体系认证"] && !/^(无|其他)$/.test(d["管理体系认证"]))
            writes.cert = d["管理体系认证"].replace(/[;；\s]+$/, "");
          if ((!f.cert_note || f.cert_note === "") && d["工商注册号/统一社会信用代码"])
            writes.cert_note = `统一社会信用代码：${d["工商注册号/统一社会信用代码"]}`;
          if (f.employee_count == null || f.employee_count === 0) writes.employee_count = lowerBound(d["员工人数"]);
          if (f.area_sqm == null || f.area_sqm === 0) writes.area_sqm = numFrom(d["厂房面积"]);
          if (!f.service_capability) {
            const bits: string[] = [];
            if (/^是/.test(d["是否提供加工/定制服务"] ?? "")) bits.push("提供加工/定制服务");
            if (d["质量控制"] && d["质量控制"] !== "无") bits.push(`质量控制：${d["质量控制"]}`);
            if (bits.length) writes.service_capability = bits.join("；");
          }
          if (d["主营行业"]) {
            let tags: string[] = [];
            try { tags = JSON.parse(f.tags ?? "[]"); } catch { tags = []; }
            const add = d["主营行业"].split(/[;；]/).map((s) => s.trim()).filter((s) => s && !tags.includes(s));
            if (add.length) writes.tags = JSON.stringify([...tags, ...add]);
          }
        }
      }
    } catch (e) {
      errMsg = String(e instanceof Error ? e.message : e).slice(0, 150);
    }

    // ② seller_info：home / 诚信通年限 / 精确员工数（优先生效）
    try {
      const r2 = await call("seller_info", sid);
      fcost += r2.billed ? PRICE_SELLER_INFO : 0;
      okSeller = r2.billed;
      if (r2.billed && !errMsg) {
        if ((!f.home || f.home === "") && r2.j?.zhuy) writes.home = String(r2.j.zhuy);
        if (f.years == null && r2.j?.tpyear != null) writes.years = Number(r2.j.tpyear) || null;
        const ci: any[] = Array.isArray(r2.j?.company_info) ? r2.j.company_info : [];
        const exact = numFrom(ci.find((x) => x?.title === "员工人数")?.value);
        const empMissing = f.employee_count == null || f.employee_count === 0;
        if (empMissing && exact != null) writes.employee_count = exact; // 精确值覆盖区间下限
      }
    } catch (e) {
      if (!errMsg) errMsg = String(e instanceof Error ? e.message : e).slice(0, 150);
    }

    for (const k of Object.keys(writes)) if (writes[k] == null) delete writes[k];

    const keys = Object.keys(writes).filter((k) => /^[a-z_]+$/.test(k));
    if (keys.length && !errMsg) {
      const sets = keys.map((k) => dsql`${dsql.raw(k)} = ${writes[k] as any}`);
      await db.execute(dsql`UPDATE factories SET ${dsql.join(sets, dsql`, `)} WHERE id=${factoryId}`);
    }
    await db.execute(dsql`UPDATE factories SET shopinfo_checked_at=NOW() WHERE id=${factoryId}`);

    await db
      .execute(
        dsql`INSERT INTO sourcing_api_logs (provider, endpoint, query, cost_cny, billed, ok, duration_ms, error) VALUES ('wanbang','item_get_shop+seller_info:live',${String(f.name).slice(0, 200)},${fcost},${okShop || okSeller},${!errMsg},0,${errMsg || null})`,
      )
      .catch(() => {});

    return {
      attempted: true,
      enriched: keys.length > 0 && !errMsg,
      reason: errMsg || (keys.length ? `写 ${keys.join(",")}` : "无空位可填") + `(¥${fcost.toFixed(2)})`,
    };
  } catch (e) {
    return no(String(e instanceof Error ? e.message : e).slice(0, 80));
  }
}
