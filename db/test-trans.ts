process.loadEnvFile();
const { getDb } = await import("../api/queries/connection");
const { sql } = await import("drizzle-orm");
const db = await getDb();
const rows: any = await db.execute(sql`SELECT offer_id, title FROM offer_pool WHERE title IS NOT NULL AND CHAR_LENGTH(title) > 8 LIMIT 1`);
const row = rows?.[0]?.[0] ?? rows?.[0];
console.log("测试商品:", row.offer_id, "|", row.title.slice(0, 30));
const q = async () => {
  const t0 = Date.now();
  const r = await fetch("http://localhost:3200/api/trpc/products.detailV2?input=" + encodeURIComponent(JSON.stringify({ json: { offerId: row.offer_id, locale: "en" } })));
  const j: any = await r.json();
  return { ms: Date.now() - t0, title: j.result?.data?.json?.offer?.title };
};
const a = await q();
console.log(`首次 ${a.ms}ms →`, a.title);
const b = await q();
console.log(`缓存 ${b.ms}ms →`, b.title);
process.exit(0);
