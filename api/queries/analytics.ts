// M5 埋点写入与归因绑定。口径定义见 contracts/metrics.ts。
import { sql as dsql } from "drizzle-orm";
import { getDb } from "./connection";

export type TrackInput = {
  event: string;
  anonId?: string | null;
  userId?: number | null;
  path?: string | null;
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  lang?: string | null;
  ua?: string | null;
};

const EVENTS = new Set(["page_view"]);

const clip = (s: string | null | undefined, n: number) => (s ? String(s).slice(0, n) : null);

export async function recordEvent(t: TrackInput): Promise<void> {
  if (!EVENTS.has(t.event)) return;
  const db = getDb();
  await db.execute(dsql`INSERT INTO analytics_events (event, anon_id, user_id, path, referrer, utm_source, utm_medium, utm_campaign, lang, ua)
    VALUES (${t.event}, ${clip(t.anonId, 64)}, ${t.userId ?? null}, ${clip(t.path, 255)}, ${clip(t.referrer, 512)},
      ${clip(t.utmSource, 64)}, ${clip(t.utmMedium, 64)}, ${clip(t.utmCampaign, 128)}, ${clip(t.lang, 8)}, ${clip(t.ua, 255)})`);
}

// 注册/登录后绑定首次接触归因：用该匿名设备最早一条带来源的访问记录；只填空不覆盖。
export async function bindUserAttr(userId: number, anonId?: string | null): Promise<void> {
  if (!anonId) return;
  const db = getDb();
  const aid = clip(anonId, 64);
  const [rows]: any = await db.execute(
    dsql`SELECT utm_source, utm_medium, utm_campaign, referrer, path, ts FROM analytics_events
      WHERE anon_id = ${aid} AND (utm_source IS NOT NULL OR (referrer IS NOT NULL AND referrer != ''))
      ORDER BY ts ASC LIMIT 1` // 首次接触 = 最早那条带来源的访问
  );
  if (rows.length) {
    const e = rows[0];
    const attr = JSON.stringify({
      source: e.utm_source ?? null, medium: e.utm_medium ?? null, campaign: e.utm_campaign ?? null,
      referrer: e.referrer ?? null, landing: e.path ?? null, at: e.ts,
    });
    await db.execute(dsql`UPDATE users SET attr = CAST(${attr} AS JSON) WHERE id = ${userId} AND attr IS NULL`);
  }
  // 该设备的历史事件补挂 user_id，漏斗才能从访客追到注册（无论有无来源都补挂）
  await db.execute(dsql`UPDATE analytics_events SET user_id = ${userId} WHERE anon_id = ${aid} AND user_id IS NULL`);
}

// 接受报价（quoted→pending_payment）：GMV 快照 + 末次接触归因（当前设备最近来源，落空则用注册时首次归因）
export async function snapshotOrderAccept(orderId: number, userId: number, anonId?: string | null): Promise<void> {
  const db = getDb();
  let attr: string | null = null;
  if (anonId) {
    const [rows]: any = await db.execute(
      dsql`SELECT utm_source, utm_medium, utm_campaign, referrer, path, ts FROM analytics_events
        WHERE anon_id = ${clip(anonId, 64)} AND (utm_source IS NOT NULL OR (referrer IS NOT NULL AND referrer != ''))
        ORDER BY ts DESC LIMIT 1` // 末次接触 = 最近那条带来源的访问
    );
    if (rows.length) {
      const e = rows[0];
      attr = JSON.stringify({
        source: e.utm_source ?? null, medium: e.utm_medium ?? null, campaign: e.utm_campaign ?? null,
        referrer: e.referrer ?? null, landing: e.path ?? null, at: e.ts,
      });
    }
  }
  if (!attr) {
    const [u]: any = await db.execute(dsql`SELECT attr FROM users WHERE id = ${userId}`);
    const ua = u[0]?.attr;
    attr = ua ? (typeof ua === "string" ? ua : JSON.stringify(ua)) : null;
  }
  // accepted_at 只写一次（重复点击不刷新入账时点）；gmv 快照 quote.totalUsd
  await db.execute(dsql`UPDATE orders SET
      accepted_at = COALESCE(accepted_at, NOW()),
      gmv_usd = CAST(JSON_UNQUOTE(JSON_EXTRACT(quote, '$.totalUsd')) AS DECIMAL(12,2)),
      attr = COALESCE(attr, CAST(${attr} AS JSON))
    WHERE id = ${orderId}`);
}
