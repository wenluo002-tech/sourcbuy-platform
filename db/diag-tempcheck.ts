// 逐接口直连诊断：nick=山派车品 的 item_get_shop / seller_info 原始返回
process.loadEnvFile();
const KEY = process.env.WANBANG_KEY!;
const SECRET = process.env.WANBANG_SECRET!;
const BASE = "https://api-gw.onebound.cn/1688";

async function raw(ep: string, sid: string) {
  const qs = new URLSearchParams({ key: KEY, secret: SECRET, lang: "zh-CN", cache: "no", sid });
  const res = await fetch(`${BASE}/${ep}/?${qs}`, { signal: AbortSignal.timeout(15000) });
  const j: any = await res.json();
  console.log(`\n=== ${ep} sid=${sid} ===`);
  console.log("error_code:", j?.error_code, "| error:", j?.error ?? "(none)");
  console.log("title:", j?.title ?? "(none)");
  console.log("tpyear:", j?.tpyear ?? "(none)", "| zhuy:", String(j?.zhuy ?? "").slice(0, 80));
  if (Array.isArray(j?.detail)) console.log("detail sections:", j.detail.length, "| first keys:", Object.keys(j.detail[0] ?? {}).slice(0, 6));
  if (Array.isArray(j?.company_info)) console.log("company_info:", j.company_info.length);
}

const qs = new URLSearchParams({ key: KEY, secret: SECRET, lang: "zh-CN", cache: "no", q: "广州山派汽车用品有限公司", page: "1" });
const res = await fetch(`${BASE}/item_search_factory/?${qs}`, { signal: AbortSignal.timeout(15000) });
const j: any = await res.json();
console.log("search error_code:", j?.error_code);
const item = j?.item?.[0];
console.log("first hit keys:", Object.keys(item ?? {}));
console.log("first hit:", JSON.stringify(item, null, 1).slice(0, 1200));
process.exit(0);
