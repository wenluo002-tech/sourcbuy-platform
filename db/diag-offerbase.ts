// dump item_get_app 返回结构找卖家字段
process.loadEnvFile();
const BASE = process.env.WANBANG_BASE!;
const KEY = process.env.WANBANG_KEY!;
const SECRET = process.env.WANBANG_SECRET!;

function walk(obj: any, path: string, depth: number, hits: string[]) {
  if (depth > 6 || obj == null) return;
  if (typeof obj !== "object") return;
  for (const [k, v] of Object.entries(obj)) {
    const p = path ? `${path}.${k}` : k;
    if (/seller|member|login|winport|shop|company/i.test(k) && typeof v !== "object") {
      hits.push(`${p} = ${String(v).slice(0, 90)}`);
    }
    if (typeof v === "object") walk(v, p, depth + 1, hits);
  }
}

async function main() {
  const offerId = process.argv[2] ?? "829195845153"; // 池里销量top且已知可拉
  const qs = new URLSearchParams({ key: KEY, secret: SECRET, lang: "zh-CN", cache: "no", num_iid: offerId });
  const res = await fetch(`${BASE}/item_get_app/?${qs}`, { signal: AbortSignal.timeout(30000) });
  const j: any = await res.json();
  console.log("error_code:", j?.error_code, "error:", j?.error ?? "");
  const hits: string[] = [];
  walk(j, "", 0, hits);
  console.log(hits.join("\n"));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
