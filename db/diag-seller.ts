// dump sellerModel 全部字段
process.loadEnvFile();
const BASE = process.env.WANBANG_BASE!;
const KEY = process.env.WANBANG_KEY!;
const SECRET = process.env.WANBANG_SECRET!;

async function main() {
  const offerId = process.argv[2] ?? "829195845153";
  const qs = new URLSearchParams({ key: KEY, secret: SECRET, lang: "zh-CN", cache: "no", num_iid: offerId });
  const res = await fetch(`${BASE}/item_get_app/?${qs}`, { signal: AbortSignal.timeout(30000) });
  const j: any = await res.json();
  const sm = j?.item?.result?.global?.globalData?.model?.sellerModel ?? {};
  console.log("sellerModel keys:");
  for (const [k, v] of Object.entries(sm)) {
    if (typeof v !== "object") console.log(`  ${k} = ${String(v).slice(0, 100)}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
