/**
 * V109 截图：雷达页小语种疗效目检 + 移动端 390 顶栏现状勘查
 * 双端 1440/390，es 语言，匿名+登录两态顶栏
 */
import { chromium } from "playwright-core";
const BASE = "http://localhost:3200";
const OUT = "/mnt/agents/output";

(async () => {
  const browser = await chromium.launch();
  // 注册一个顶栏登录态测试号（非 qa- 前缀，QA 自清场不会删）
  const email = `v109shot${Date.now()}@test.com`;
  const reg = await fetch(`${BASE}/api/trpc/auth.register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ json: { email, password: "V109Shot!234", name: "Shot" } }),
  }).then((r) => r.json()).catch(() => null);
  const token = reg?.result?.data?.json?.token ?? null;
  console.log("测试号注册:", email, token ? "拿到token" : "无token(仅匿名态)");

  for (const [name, width, height] of [["desktop", 1440, 900], ["mobile", 390, 844]] as const) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
    await ctx.addInitScript(() => localStorage.setItem("sb-lang", "es"));
    const page = await ctx.newPage();
    // 雷达页 es（疗效目检）
    await page.goto(`${BASE}/radar`, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/v109-radar-es-${name}.png`, fullPage: false });
    // 首页 390 匿名顶栏
    await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/v109-home-anon-${name}.png`, fullPage: false });
    // 登录态顶栏
    if (token) {
      await ctx.addInitScript((tk) => localStorage.setItem("sb-token", tk as string), token);
      await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/v109-home-auth-${name}.png`, fullPage: false });
    }
    await ctx.close();
    console.log(name, "截图完成");
  }
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
