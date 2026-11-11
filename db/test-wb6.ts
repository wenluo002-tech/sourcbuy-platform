process.loadEnvFile();
const KEY = process.env.WANBANG_KEY || "";
const SECRET = process.env.WANBANG_SECRET || "";
async function wb(ep: string, params: Record<string, string>) {
  const qs = new URLSearchParams({ key: KEY, secret: SECRET, lang: "zh-CN", cache: "no", ...params });
  const res = await fetch(`https://api-gw.onebound.cn/1688/${ep}/?${qs}`, { signal: AbortSignal.timeout(15000) });
  return res.json();
}
const sid = "b2b-2856011157374ed";
const shop: any = await wb("item_get_shop", { sid });
console.log("item_get_shop →", shop?.error_code, "| title:", shop?.title ?? "(无)");
const info: any = await wb("seller_info", { sid });
console.log("seller_info →", info?.error_code, "| tpyear:", info?.tpyear ?? "(无)", "| 公司:", info?.company_name ?? info?.title ?? "(无)");
process.exit(0);
