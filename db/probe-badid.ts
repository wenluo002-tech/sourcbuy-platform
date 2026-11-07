process.loadEnvFile();
const BASE = process.env.WANBANG_BASE ?? "https://api-gw.onebound.cn/1688";
const KEY = process.env.WANBANG_KEY!;
const SECRET = process.env.WANBANG_SECRET!;
const qs = new URLSearchParams({ key: KEY, secret: SECRET, lang: "zh-CN", cache: "no", q: "吊灯", page: "1" });
const res = await fetch(`${BASE}/item_search_factory/?${qs}`, { signal: AbortSignal.timeout(30000) });
const j: any = await res.json();
const arr: any[] = Array.isArray(j?.item) ? j.item : [];
for (const it of arr) {
  const sid = String(it.seller_id ?? "");
  if (!/^b2b-[0-9a-z]+$/i.test(sid)) console.log("非标ID:", JSON.stringify({ seller_id: it.seller_id, title: it.title, seller_nick: it.seller_nick }));
}
console.log("---正常样本---");
for (const it of arr.slice(0,3)) console.log(JSON.stringify({ seller_id: it.seller_id, title: it.title }));
process.exit(0);
