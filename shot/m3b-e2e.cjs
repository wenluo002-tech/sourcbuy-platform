// M3b 订单页双语+移动端目检：注册→询价→运营报价(CLI)→页面截图→UI 确认报价
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const BASE = "http://localhost:3200";

async function api(path, body, cookie, method = "POST") {
  const url = method === "GET"
    ? `${BASE}/api/trpc/${path}${body !== undefined ? `?input=${encodeURIComponent(JSON.stringify({ json: body }))}` : ""}`
    : `${BASE}/api/trpc/${path}`;
  const r = await fetch(url, {
    method, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: method === "POST" && body !== undefined ? JSON.stringify({ json: body }) : undefined,
  });
  const m = (r.headers.get("set-cookie") ?? "").match(/sb_session=([^;]*)/);
  return { status: r.status, json: await r.json().catch(() => null), cookie: m?.[1] ? `sb_session=${m[1]}` : null };
}

(async () => {
  const em = `e2e-${Date.now()}-zh@sourcbuy.test`;
  const reg = await api("auth.register", { email: em, password: "e2e-pass-123456", displayName: "E2E买家", locale: "zh" });
  const cookie = reg.cookie;
  console.log("注册:", reg.status, !!cookie);
  const c = await api("orders.create", { demand: "E2E：瑜伽裤 500 条，发德国汉堡", quantity: 500, destination: "德国汉堡", productTitle: "高腰裸感瑜伽裤女外穿紧身运动裤", offerId: "1000001904473" }, cookie);
  const oid = c.json.result.data.json.orderId;
  const ono = c.json.result.data.json.orderNo;
  console.log("询价建档:", ono);
  // 运营报价（CLI 等价路径）
  const quote = JSON.stringify({ exwUnitPriceCny: 28.62, goodsTotalCny: 14310, freightUsd: 420, dutyUsd: 0, commissionUsd: 157.9, commissionRate: 0.07, totalUsd: 2835, fxRate: 6.34, channel: "空派专线", etaDays: "8-12 天", note: "含裤腰松紧带拉力抽检" });
  console.log(execSync(`npx tsx db/order-transition.ts ${ono} quoted "E2E 核价" --quote '${quote}'`, { cwd: "/mnt/agents/output/app", encoding: "utf-8" }).trim());

  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const [name, val] = cookie.split("=");
  await ctx.addCookies([{ name, value: val, domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/orders`, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.setItem("sb-lang", "zh"));
  await page.reload({ waitUntil: "networkidle" });
  await page.screenshot({ path: "shot/m3b-1-list-zh.png" });

  await page.goto(`${BASE}/orders/${oid}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: "shot/m3b-2-detail-quoted-zh.png", fullPage: true });

  // 英文版详情
  await page.evaluate(() => localStorage.setItem("sb-lang", "en"));
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.screenshot({ path: "shot/m3b-3-detail-quoted-en.png", fullPage: true });

  // UI 点击「接受报价」→ 待付款
  await page.evaluate(() => localStorage.setItem("sb-lang", "zh"));
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "接受报价，去付款" }).click();
  await page.waitForTimeout(1500);
  const body = await page.locator("body").innerText();
  console.log("确认报价后状态=待付款:", body.includes("待付款") ? "PASS" : "FAIL");
  await page.screenshot({ path: "shot/m3b-4-pending-zh.png", fullPage: true });

  // 移动端
  const mob = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mob.goto(`${BASE}/orders`, { waitUntil: "networkidle" });
  await mob.evaluate(() => localStorage.setItem("sb-lang", "zh"));
  await mob.reload({ waitUntil: "networkidle" });
  await mob.screenshot({ path: "shot/m3b-5-list-mobile.png" });

  console.log("E2E_DONE orderId=" + oid);
  await browser.close();
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
