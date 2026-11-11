// M5 管理端查询层。所有口径经 contracts/metrics.ts；ops 闸在路由层。
// 注意：MySQL 的 INTERVAL 不接受绑定参数，天数只走 rangeDays 白名单后用 dsql.raw 内联。
import { sql as dsql } from "drizzle-orm";
import { getDb } from "./connection";
import { normalizeChannel, GMV_LABEL } from "../../contracts/metrics";

const rangeDays = (r?: string) => (r === "30d" ? 30 : r === "7d" ? 7 : 1);

export async function adminOverview(range?: string) {
  const db = getDb();
  const days = rangeDays(range);
  const curFrom = days === 1
    ? dsql`ts >= DATE(NOW())`
    : dsql`ts >= DATE_SUB(NOW(), INTERVAL ${dsql.raw(String(days - 1))} DAY)`;
  const atFrom = (col: string) =>
    days === 1
      ? dsql`${dsql.raw(col)} >= DATE(NOW())`
      : dsql`${dsql.raw(col)} >= DATE_SUB(NOW(), INTERVAL ${dsql.raw(String(days - 1))} DAY)`;

  const [[ev]]: any = await db.execute(
    dsql`SELECT COUNT(*) AS pv, COUNT(DISTINCT anon_id) AS uv FROM analytics_events WHERE event='page_view' AND ${curFrom}`
  );
  const [[u]]: any = await db.execute(
    dsql`SELECT COUNT(*) AS signups FROM users WHERE ${atFrom("created_at")}`
  );
  const [[o]]: any = await db.execute(
    dsql`SELECT
        SUM(${atFrom("created_at")}) AS inquiries,
        SUM(accepted_at IS NOT NULL AND ${atFrom("accepted_at")}) AS accepted,
        COALESCE(SUM(CASE WHEN accepted_at IS NOT NULL AND ${atFrom("accepted_at")} THEN gmv_usd END), 0) AS gmv
      FROM orders`
  );

  // 环比（前一个等长周期）
  const prevRange = (col: string) => {
    const c = dsql.raw(col);
    return days === 1
      ? dsql`${c} >= DATE_SUB(DATE(NOW()), INTERVAL 1 DAY) AND ${c} < DATE(NOW())`
      : dsql`${c} >= DATE_SUB(NOW(), INTERVAL ${dsql.raw(String(2 * days - 1))} DAY) AND ${c} < DATE_SUB(NOW(), INTERVAL ${dsql.raw(String(days - 1))} DAY)`;
  };
  const [[evP]]: any = await db.execute(
    dsql`SELECT COUNT(DISTINCT anon_id) AS uv FROM analytics_events WHERE event='page_view' AND ${prevRange("ts")}`
  );
  const [[oP]]: any = await db.execute(
    dsql`SELECT SUM(accepted_at IS NOT NULL AND ${prevRange("accepted_at")}) AS accepted,
            COALESCE(SUM(CASE WHEN accepted_at IS NOT NULL AND ${prevRange("accepted_at")} THEN gmv_usd END), 0) AS gmv
      FROM orders`
  );
  const [[uP]]: any = await db.execute(
    dsql`SELECT COUNT(*) AS signups FROM users WHERE ${prevRange("created_at")}`
  );

  // 每日序列（最多 30 天）
  const [series]: any = await db.execute(
    dsql`SELECT d, SUM(uv) AS uv, SUM(signups) AS signups, SUM(accepted) AS accepted, SUM(gmv) AS gmv FROM (
        SELECT DATE(ts) AS d, COUNT(DISTINCT anon_id) AS uv, 0 AS signups, 0 AS accepted, 0 AS gmv
          FROM analytics_events WHERE event='page_view' AND ts >= DATE_SUB(NOW(), INTERVAL ${dsql.raw(String(days - 1))} DAY) GROUP BY DATE(ts)
        UNION ALL
        SELECT DATE(created_at), 0, COUNT(*), 0, 0 FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL ${dsql.raw(String(days - 1))} DAY) GROUP BY DATE(created_at)
        UNION ALL
        SELECT DATE(accepted_at), 0, 0, COUNT(*), COALESCE(SUM(gmv_usd),0) FROM orders
          WHERE accepted_at IS NOT NULL AND accepted_at >= DATE_SUB(NOW(), INTERVAL ${dsql.raw(String(days - 1))} DAY) GROUP BY DATE(accepted_at)
      ) x GROUP BY d ORDER BY d`
  );

  // 渠道 Top：访客按 events、注册/成交/GMV 按归因快照，JS 侧归一化（量小，精确优先）
  const [evCh]: any = await db.execute(
    dsql`SELECT utm_source, referrer, COUNT(DISTINCT anon_id) AS uv FROM analytics_events
      WHERE event='page_view' AND ${curFrom} GROUP BY utm_source, referrer`
  );
  const [uCh]: any = await db.execute(
    dsql`SELECT attr, COUNT(*) AS n FROM users WHERE ${atFrom("created_at")} AND attr IS NOT NULL GROUP BY attr`
  );
  const [oCh]: any = await db.execute(
    dsql`SELECT attr, COUNT(*) AS n, COALESCE(SUM(gmv_usd),0) AS gmv FROM orders
      WHERE accepted_at IS NOT NULL AND ${atFrom("accepted_at")} AND attr IS NOT NULL GROUP BY attr`
  );
  const chMap = new Map<string, { channel: string; uv: number; signups: number; accepted: number; gmv: number }>();
  const chGet = (name: string) => {
    if (!chMap.has(name)) chMap.set(name, { channel: name, uv: 0, signups: 0, accepted: 0, gmv: 0 });
    return chMap.get(name)!;
  };
  for (const r of evCh) chGet(normalizeChannel(r.utm_source, r.referrer)).uv += Number(r.uv);
  const attrOf = (a: any) => { try { const j = typeof a === "string" ? JSON.parse(a) : a; return j ?? {}; } catch { return {}; } };
  for (const r of uCh) { const j = attrOf(r.attr); chGet(normalizeChannel(j.source, j.referrer)).signups += Number(r.n); }
  for (const r of oCh) { const j = attrOf(r.attr); const c = chGet(normalizeChannel(j.source, j.referrer)); c.accepted += Number(r.n); c.gmv += Number(r.gmv); }
  const channels = [...chMap.values()].sort((a, b) => b.uv - a.uv || b.gmv - a.gmv).slice(0, 8);

  return {
    gmvLabel: GMV_LABEL,
    kpis: {
      uv: Number(ev.uv), pv: Number(ev.pv), signups: Number(u.signups),
      inquiries: Number(o.inquiries ?? 0), accepted: Number(o.accepted ?? 0), gmv: Number(o.gmv),
    },
    prev: { uv: Number(evP.uv), signups: Number(uP.signups), accepted: Number(oP.accepted ?? 0), gmv: Number(oP.gmv) },
    funnel: [
      { stage: "访客", value: Number(ev.uv) },
      { stage: "注册", value: Number(u.signups) },
      { stage: "发起询价", value: Number(o.inquiries ?? 0) },
      { stage: "接受报价", value: Number(o.accepted ?? 0) },
    ],
    series: series.map((s: any) => ({ date: String(s.d).slice(0, 10), uv: Number(s.uv), signups: Number(s.signups), accepted: Number(s.accepted), gmv: Number(s.gmv) })),
    channels,
    note: days === 1 ? "埋点自 2026-11-11 起累计；注册/询价/成交为库内真实台账" : "注册/询价/成交为库内真实台账；访客与浏览量来自站内埋点",
  };
}

export async function adminChannels(range?: string) {
  const ov = await adminOverview(range);
  return { channels: ov.channels, gmvLabel: ov.gmvLabel };
}

export async function adminBuyers(q?: string) {
  const db = getDb();
  const kw = q?.trim() ? `%${q.trim()}%` : null;
  const [rows]: any = await db.execute(
    dsql`SELECT u.id, u.email, u.display_name, u.locale, u.created_at, u.last_login_at, u.attr,
          COUNT(o.id) AS orders, COALESCE(SUM(CASE WHEN o.accepted_at IS NOT NULL THEN o.gmv_usd END),0) AS gmv,
          SUM(CASE WHEN o.accepted_at IS NOT NULL THEN 1 ELSE 0 END) AS accepted
      FROM users u LEFT JOIN orders o ON o.user_id = u.id
      ${kw ? dsql`WHERE u.email LIKE ${kw} OR u.display_name LIKE ${kw}` : dsql``}
      GROUP BY u.id ORDER BY u.created_at DESC LIMIT 200`
  );
  return rows.map((r: any) => {
    let channel = "直接访问";
    try {
      const j = typeof r.attr === "string" ? JSON.parse(r.attr) : r.attr;
      if (j) channel = normalizeChannel(j.source, j.referrer);
    } catch { /* attr 坏了就当直接访问 */ }
    return {
      id: r.id, email: r.email, name: r.display_name, locale: r.locale,
      createdAt: r.created_at, lastLoginAt: r.last_login_at, channel,
      orders: Number(r.orders), accepted: Number(r.accepted), gmv: Number(r.gmv),
    };
  });
}

export async function adminBuyerDetail(id: number) {
  const db = getDb();
  const [u]: any = await db.execute(
    dsql`SELECT id, email, display_name, locale, created_at, last_login_at, attr FROM users WHERE id = ${id}`
  );
  if (!u.length) return null;
  const [orders]: any = await db.execute(
    dsql`SELECT id, order_no, status, product_title, quantity, destination, gmv_usd, created_at, accepted_at
      FROM orders WHERE user_id = ${id} ORDER BY id DESC LIMIT 50`
  );
  const [[th]]: any = await db.execute(dsql`SELECT COUNT(*) AS n FROM chat_threads WHERE user_id = ${id}`);
  let attr: any = null;
  try { attr = typeof u[0].attr === "string" ? JSON.parse(u[0].attr) : u[0].attr; } catch { /* 坏数据 */ }
  return { user: { ...u[0], attr }, orders, threads: Number(th.n) };
}

export async function adminOrders(status?: string) {
  const db = getDb();
  const [rows]: any = await db.execute(
    dsql`SELECT o.id, o.order_no, o.status, o.product_title, o.quantity, o.destination, o.gmv_usd, o.created_at, o.accepted_at, u.email
      FROM orders o JOIN users u ON u.id = o.user_id
      ${status ? dsql`WHERE o.status = ${status}` : dsql``} ORDER BY o.id DESC LIMIT 200`
  );
  return rows;
}

export async function adminHealth() {
  const db = getDb();
  const [[f]]: any = await db.execute(
    dsql`SELECT COUNT(*) AS total,
          SUM(score IS NULL) AS noScore,
          SUM(is_trader = 1) AS traders,
          SUM(tags LIKE '%buyer_nominated%') AS nominated
      FROM factories`
  );
  const [[api]]: any = await db.execute(
    dsql`SELECT COALESCE(SUM(cost_cny),0) AS cost, COUNT(*) AS calls FROM sourcing_api_logs WHERE created_at >= DATE(NOW()) AND billed = 1`
  );
  const [[tr]]: any = await db.execute(dsql`SELECT COUNT(*) AS n FROM text_translations`);
  const [[ev]]: any = await db.execute(dsql`SELECT COUNT(*) AS n FROM analytics_events WHERE ts >= DATE(NOW())`);
  const [[qc2]]: any = await db.execute(
    dsql`SELECT SUM(verdict IS NULL) AS pending, COUNT(*) AS total FROM inspection_reports`
  );
  return {
    factories: { total: Number(f.total), noScore: Number(f.noScore ?? 0), traders: Number(f.traders ?? 0), nominated: Number(f.nominated ?? 0) },
    apiToday: { cost: Number(api.cost), calls: Number(api.calls) },
    translationCache: Number(tr.n),
    eventsToday: Number(ev.n),
    qc: { pending: Number(qc2?.pending ?? 0), total: Number(qc2?.total ?? 0) },
  };
}
