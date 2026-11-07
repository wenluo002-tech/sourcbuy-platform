// 探针：item_search_factory 按品类词搜，看返回结构与字段（成本 ¥0.022×2）
process.loadEnvFile();
const BASE = process.env.WANBANG_BASE ?? "https://api-gw.onebound.cn/1688";
const KEY = process.env.WANBANG_KEY!;
const SECRET = process.env.WANBANG_SECRET!;

async function probe(q: string, page = 1) {
  const qs = new URLSearchParams({ key: KEY, secret: SECRET, lang: "zh-CN", cache: "no", q, page: String(page) });
  const res = await fetch(`${BASE}/item_search_factory/?${qs}`, { signal: AbortSignal.timeout(30000) });
  const j: any = await res.json();
  const arr: any[] = Array.isArray(j?.item) ? j.item : [];
  console.log(`\n=== 「${q}」 page${page} error_code=${j?.error_code} total=${j?.total_results ?? j?.total ?? "?"} 条数=${arr.length} ===`);
  if (arr[0]) {
    console.log("字段清单:", Object.keys(arr[0]).join(", "));
    for (const it of arr.slice(0, 5)) {
      console.log(JSON.stringify({
        title: it.title, seller_id: it.seller_id, seller_nick: it.seller_nick,
        area: it.area, cat_name: it.cat_name, winport: it.winport_url ?? it.shop_url ?? null,
      }));
    }
  }
}

await probe("吊灯");
await new Promise((r) => setTimeout(r, 1000));
await probe("中性笔");
process.exit(0);
