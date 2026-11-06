// 实测 item_search_factory 返回结构（约 ¥0.022×2）—— 看有没有可用于打标的产品信息
process.loadEnvFile();
const BASE = process.env.WANBANG_BASE ?? "https://api-gw.onebound.cn/1688";
const KEY = process.env.WANBANG_KEY!;
const SECRET = process.env.WANBANG_SECRET!;

async function probe(q: string) {
  const qs = new URLSearchParams({ key: KEY, secret: SECRET, lang: "zh-CN", cache: "no", q, page: "1" });
  const res = await fetch(`${BASE}/item_search_factory/?${qs}`, { signal: AbortSignal.timeout(30000) });
  const j: any = await res.json();
  console.log(`\n═══ q="${q}" error_code=${j?.error_code} ═══`);
  const arr: any[] = Array.isArray(j?.item) ? j.item : [];
  console.log("返回条数:", arr.length, "| 顶层键:", Object.keys(j).slice(0, 12).join(","));
  if (arr[0]) {
    console.log("首条字段:", Object.keys(arr[0]).join(","));
    console.log("首条内容:", JSON.stringify(arr[0]).slice(0, 600));
  }
}
(async () => {
  await probe("惠州市浩强橡胶制品厂");
  await probe("台州市安甄雅塑业有限公司");
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
