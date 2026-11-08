import { chromium } from "playwright-core";
const BASE = "http://localhost:3200";
const login = await fetch(`${BASE}/api/trpc/auth.login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ json: { email: "m4atest1794109068991@test.com", password: "Test1234!" } }) });
const cookie = login.headers.get("set-cookie") || "";
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-CN" });
const [pair] = cookie.split(";"); const [k, v] = pair.split("=");
await ctx.addCookies([{ name: k, value: v, url: BASE }]);
const page = await ctx.newPage();
await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2200);
const m = await page.evaluate(() => {
  const nav = document.querySelector("header nav")!;
  const r = { scrollW: nav.scrollWidth, clientW: nav.clientWidth, overflow: getComputedStyle(nav).overflowX };
  nav.scrollLeft = 9999; // 滑到最右
  return r;
});
console.log("nav:", JSON.stringify(m));
await page.waitForTimeout(400);
await page.screenshot({ path: "/tmp/m4a-shots/dash_mobile_navright.png", fullPage: false });
await browser.close(); process.exit(0);
