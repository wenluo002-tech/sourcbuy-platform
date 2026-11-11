process.loadEnvFile();
const KEY = process.env.WANBANG_KEY || "";
const SECRET = process.env.WANBANG_SECRET || "";
async function probe(kw: string) {
  const qs = new URLSearchParams({ key: KEY, secret: SECRET, lang: "zh-CN", cache: "no", q: kw, page: "1" });
  const res = await fetch(`https://api-gw.onebound.cn/1688/item_search_factory/?${qs}`, { signal: AbortSignal.timeout(15000) });
  const j: any = await res.json();
  const arr = Array.isArray(j?.item) ? j.item : (j?.items?.item ?? []);
  console.log(`q="${kw}" → error_code=${j?.error_code} 命中=${arr.length}`);
  for (const f of arr.slice(0, 3)) console.log("  -", f.title, "|", f.seller_id ?? f.seller_nick, "|", f.area ?? "");
}
await probe("广州鸿讯电子有限公司");
await probe("鸿讯电子");
await probe("鸿讯");
process.exit(0);
