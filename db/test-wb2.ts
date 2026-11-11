process.loadEnvFile();
const KEY = process.env.WANBANG_KEY || "";
const SECRET = process.env.WANBANG_SECRET || "";
async function probe(ep: string, kw: string) {
  const qs = new URLSearchParams({ key: KEY, secret: SECRET, lang: "zh-CN", cache: "no", keywords: kw });
  const res = await fetch(`https://api-gw.onebound.cn/1688/${ep}/?${qs}`, { signal: AbortSignal.timeout(15000) });
  const j: any = await res.json();
  console.log(`[${ep}] kw="${kw}" → error_code=${j?.error_code} error=${j?.error} items=${j?.items?.item?.length ?? "无"}`);
}
await probe("item_search_factory", "stapler");
await probe("item_search_factory", "广州鸿讯电子有限公司");
await probe("item_search", "广州鸿讯电子有限公司");
process.exit(0);
