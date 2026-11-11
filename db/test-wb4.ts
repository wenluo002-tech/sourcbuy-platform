process.loadEnvFile();
const KEY = process.env.WANBANG_KEY || "";
const SECRET = process.env.WANBANG_SECRET || "";
async function probe(ep: string, paramName: string, kw: string) {
  const qs = new URLSearchParams({ key: KEY, secret: SECRET, lang: "zh-CN", cache: "no", [paramName]: kw });
  const res = await fetch(`https://api-gw.onebound.cn/1688/${ep}/?${qs}`, { signal: AbortSignal.timeout(15000) });
  const j: any = await res.json();
  const n = j?.items?.item?.length ?? j?.items?.length ?? 0;
  console.log(`[${ep}] ${paramName}="${kw}" → error_code=${j?.error_code} error="${j?.error}" items=${n}`);
  if (n > 0) console.log("  首条:", JSON.stringify(j.items.item?.[0] ?? j.items[0]).slice(0, 200));
}
await probe("item_search_factory", "q", "广州鸿讯电子有限公司");
await probe("item_search", "q", "stapler");
process.exit(0);
