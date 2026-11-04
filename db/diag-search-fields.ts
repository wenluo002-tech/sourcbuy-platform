// 看 item_search 原始返回是否带卖家字段（seller_nick/member_id 等）
process.loadEnvFile();
const BASE = process.env.WANBANG_BASE!;
const KEY = process.env.WANBANG_KEY!;
const SECRET = process.env.WANBANG_SECRET!;

async function main() {
  const qs = new URLSearchParams({ key: KEY, secret: SECRET, lang: "zh-CN", cache: "no", q: "宠物降温垫", page: "1", page_size: "5" });
  const res = await fetch(`${BASE}/item_search/?${qs}`, { signal: AbortSignal.timeout(30000) });
  const j: any = await res.json();
  console.log("error_code:", j?.error_code);
  const arr: any[] = j?.items?.item ?? j?.item ?? [];
  console.log("items:", arr.length);
  if (arr[0]) {
    console.log("first item keys:", Object.keys(arr[0]).join(", "));
    console.log(JSON.stringify(arr[0], null, 1).slice(0, 1500));
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
