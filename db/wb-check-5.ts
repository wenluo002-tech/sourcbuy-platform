// 万邦 5 接口开通核验（2026-11-05，Andy 确认全部打开后实测）
// 用 Andy 给的样例参数逐个打，核对 error_code 与关键字段；密钥从 .env 读，不打印
import { loadEnvFile } from "node:process";

try { loadEnvFile(); } catch {}
const KEY = process.env.WANBANG_KEY!;
const SECRET = process.env.WANBANG_SECRET!;
const BASE = (process.env.WANBANG_BASE ?? "https://api-gw.onebound.cn/1688").replace(/\/$/, "");

const tests: { api: string; params: Record<string, string>; check: (d: any) => string }[] = [
  { api: "item_get", params: { num_iid: "1033711780757" },
    check: (d) => d?.item?.title ? `OK 标题=${String(d.item.title).slice(0, 20)}` : `⚠️ 无 item.title（keys: ${d?.item ? Object.keys(d.item).slice(0, 8).join(",") : "无 item"})` },
  { api: "item_search", params: { q: "女装", start_price: "0", end_price: "0", page: "1", cat: "0", page_size: "40" },
    check: (d) => Array.isArray(d?.items?.item) ? `OK ${d.items.item.length} 条` : `⚠️ 无 items.item（keys: ${d ? Object.keys(d).slice(0, 8).join(",") : "空"})` },
  { api: "item_fee", params: { num_iid: "577523351572", area_id: "650100", temp_id: "15315901", nick: "盈龙服饰", location: "14127178", unitweight: "0.8", sku_list: "" },
    check: (d) => d ? `OK（keys: ${Object.keys(d).slice(0, 8).join(",")}）` : "⚠️ 空响应" },
  { api: "item_search_factory", params: { q: "衣服", page: "1" },
    check: (d) => Array.isArray(d?.items?.item) ? `OK ${d.items.item.length} 条` : `⚠️ 无 items.item（keys: ${d ? Object.keys(d).slice(0, 8).join(",") : "空"})` },
  { api: "item_get_app", params: { num_iid: "1094419101666" },
    check: (d) => d?.item?.result?.data ? `OK result.data 在` : `⚠️ 无 item.result.data（keys: ${d?.item ? Object.keys(d.item).slice(0, 8).join(",") : "无 item"})` },
];

for (const t of tests) {
  const qs = new URLSearchParams({ key: KEY, secret: SECRET, cache: "no", lang: "zh-CN", ...t.params });
  const url = `${BASE}/${t.api}/?${qs}`;
  const t0 = Date.now();
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    const j: any = await r.json();
    const code = j?.error_code ?? j?.code ?? "?";
    const msg = j?.reason ?? j?.error ?? j?.msg ?? "";
    console.log(`[${t.api}] HTTP ${r.status} ${Date.now() - t0}ms | error_code=${code} ${msg} | ${code === "0000" ? t.check(j) : "❌ 未开通或报错"}`);
  } catch (e: any) {
    console.log(`[${t.api}] ❌ 请求失败: ${e.message}`);
  }
}
