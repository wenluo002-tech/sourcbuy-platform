import { loadEnvFile } from "node:process";
try { loadEnvFile(); } catch {}
const qs = new URLSearchParams({ key: process.env.WANBANG_KEY!, secret: process.env.WANBANG_SECRET!, cache: "no", lang: "zh-CN", q: "衣服", page: "1" });
const r = await fetch(`${(process.env.WANBANG_BASE ?? "https://api-gw.onebound.cn/1688").replace(/\/$/, "")}/item_search_factory/?${qs}`, { signal: AbortSignal.timeout(30_000) });
const j: any = await r.json();
console.log("error_code=", j.error_code, "| total=", j.total_results, "| item 是数组?", Array.isArray(j.item), "| 条数=", j.item?.length, "| 首条keys=", j.item?.[0] ? Object.keys(j.item[0]).slice(0, 10).join(",") : "无");
