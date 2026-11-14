import { getDb } from "./connection";
import { radarItems } from "../../db/schema";
import { asc, eq } from "drizzle-orm";
import { proxyImageUrl } from "../lib/imgProxy";

// 单条雷达品（对话链路用：雷达卡 CTA 带 radarId 直达）
export async function getRadarItem(id: number) {
  const db = getDb();
  const rows = await db.select().from(radarItems).where(eq(radarItems.id, id)).limit(1);
  const r = rows[0];
  if (!r || !r.active) return null;
  return {
    id: Number(r.id),
    title: r.title,
    titleEn: r.titleEn,
    keyword: r.keyword,
    signalSource: r.signalSource,
    signalText: r.signalText,
    signalDate: r.signalDate,
    retailPriceUsd: r.retailPriceUsd != null ? Number(r.retailPriceUsd) : null,
    factoryPriceMin: r.factoryPriceMin != null ? Number(r.factoryPriceMin) : null,
    factoryPriceMax: r.factoryPriceMax != null ? Number(r.factoryPriceMax) : null,
    upstreamCount: r.upstreamCount,
    vettedCount: r.vettedCount,
    note: r.note,
    trendDirection: r.trendDirection,
    trendCheckedAt: r.trendCheckedAt,
  };
}

// 爆款雷达：只返回 active 条目，按运营排期排序
export async function listRadar() {
  const db = getDb();
  const rows = await db
    .select()
    .from(radarItems)
    .where(eq(radarItems.active, true))
    .orderBy(asc(radarItems.sortOrder));
  return {
    items: rows.map((r) => ({
      id: Number(r.id),
      title: r.title,
      titleEn: r.titleEn,
      signalSource: r.signalSource,
      signalText: r.signalText,
      signalUrl: r.signalUrl,
      signalDate: r.signalDate,
      imageUrl: proxyImageUrl(r.imageUrl ?? null),
      retailPriceUsd: r.retailPriceUsd != null ? Number(r.retailPriceUsd) : null,
      factoryPriceMin: r.factoryPriceMin != null ? Number(r.factoryPriceMin) : null,
      factoryPriceMax: r.factoryPriceMax != null ? Number(r.factoryPriceMax) : null,
      upstreamCount: r.upstreamCount,
      vettedCount: r.vettedCount,
      topSales: r.topSales,
      note: r.note,
      trendDirection: r.trendDirection,
      trendCheckedAt: r.trendCheckedAt,
    })),
  };
}
