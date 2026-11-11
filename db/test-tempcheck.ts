process.loadEnvFile();
const KEY = process.env.WANBANG_KEY || "";
const SECRET = process.env.WANBANG_SECRET || "";
const qs = new URLSearchParams({ key: KEY, secret: SECRET, lang: "zh-CN", cache: "no", keywords: "广州鸿讯电子有限公司" });
try {
  const res = await fetch(`https://api-gw.onebound.cn/1688/item_search_factory/?${qs}`, { signal: AbortSignal.timeout(15000) });
  const j: any = await res.json();
  console.log("HTTP", res.status, "| error_code:", j?.error_code, "| error:", j?.error);
  console.log("items 数:", j?.items?.item?.length ?? j?.items?.length ?? "无");
  console.log("reason:", j?.reason ?? "无");
} catch (e) {
  console.log("FETCH 异常:", e instanceof Error ? e.message : String(e));
}
process.exit(0);
