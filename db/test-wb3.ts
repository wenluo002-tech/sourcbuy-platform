process.loadEnvFile();
const KEY = process.env.WANBANG_KEY || "";
const SECRET = process.env.WANBANG_SECRET || "";
console.log("KEY 长度:", KEY.length, "SECRET 长度:", SECRET.length);
// 试 item_get_app（此前验证过的端点）看鉴权是否正常
const qs = new URLSearchParams({ key: KEY, secret: SECRET, lang: "zh-CN", cache: "no", num_iid: "840699102922" });
const res = await fetch(`https://api-gw.onebound.cn/1688/item_get_app/?${qs}`, { signal: AbortSignal.timeout(15000) });
const j: any = await res.json();
console.log("item_get_app →", "error_code:", j?.error_code, "| error:", j?.error, "| 有item:", !!j?.item);
process.exit(0);
