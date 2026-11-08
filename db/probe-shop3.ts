process.loadEnvFile();
const KEY = process.env.WANBANG_KEY!;
const SECRET = process.env.WANBANG_SECRET!;
async function probe(ep: string, sid: string) {
  const qs = new URLSearchParams({ key: KEY, secret: SECRET, lang: "zh-CN", cache: "yes", sid });
  const res = await fetch(`https://api-gw.onebound.cn/1688/${ep}/?${qs}`, { signal: AbortSignal.timeout(30000) });
  const j: any = await res.json();
  if (ep === "item_get_shop") {
    console.log(`item_get_shop(${sid}): code=${j?.error_code} title=${j?.title ?? "null"} detail节数=${Array.isArray(j?.detail) ? j.detail.length : 0}`);
  } else {
    console.log(`seller_info(${sid}): code=${j?.error_code} title=${j?.title ?? "null"} tpyear=${j?.tpyear ?? "null"} ci=${Array.isArray(j?.company_info) ? j.company_info.length : 0}项`);
  }
}
// loginId 形态测 item_get_shop
await probe("item_get_shop", "a201035");
await new Promise(r => setTimeout(r, 1200));
// 另一家 b2b 测 seller_info（排除单店数据稀疏）
await probe("seller_info", "b2b-259455830669c38");
process.exit(0);
