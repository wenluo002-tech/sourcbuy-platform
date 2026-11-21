/**
 * 设计团队交接包·全站现状截图：10 核心页 × 桌面1440/移动390，英文界面
 * 输出 /mnt/agents/output/design-pack/{page}-{desktop|mobile}.png
 */
import { chromium } from "playwright-core";
import * as fs from "fs";
const BASE = "http://localhost:3200";
const OUT = "/mnt/agents/output/design-pack";

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  // 登录态测试号（Dashboard/Orders 需要）
  const email = `designpack${Date.now()}@test.com`;
  const reg = await fetch(`${BASE}/api/trpc/auth.register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ json: { email, password: "DesignPack!23", name: "Buyer" } }),
  }).then((r) => r.json()).catch(() => null);
  const token = reg?.result?.data?.json?.token ?? null;

  const anonPages: [string, string][] = [
    ["home", "/"],
    ["chat-empty", "/buyer"],
    ["radar", "/radar"],
    ["factories", "/factories"],
    ["calculator", "/calculator"],
    ["login", "/login"],
    ["verify", "/verify"],
  ];
  const authPages: [string, string][] = [
    ["dashboard", "/dashboard"],
    ["orders", "/orders"],
  ];

  for (const [dev, width, height] of [["desktop", 1440, 900], ["mobile", 390, 844]] as const) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1.5 });
    await ctx.addInitScript(() => localStorage.setItem("sb-lang", "en"));
    const page = await ctx.newPage();
    for (const [name, path] of anonPages) {
      await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(1800);
      await page.screenshot({ path: `${OUT}/${name}-${dev}.png` });
      console.log(name, dev, "ok");
    }
    // 工厂详情+商品详情：从列表页点第一个真实链接进去
    await page.goto(`${BASE}/factories`, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1800);
    const facLink = page.locator('a[href^="/factories/"]').first();
    if (await facLink.count()) {
      await facLink.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${OUT}/factory-detail-${dev}.png` });
      console.log("factory-detail", dev, "ok");
    }
    await page.goto(`${BASE}/radar`, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);
    // 对话页带一轮真实对话（探源卡+商品墙的全貌）
    await page.goto(`${BASE}/buyer`, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const ta = page.locator("textarea").first();
    if (await ta.count()) {
      await ta.click();
      await ta.fill("500 yoga leggings, ship to Hamburg Germany");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(35000); // 等 LLM 答话+探源卡+商品墙
      await page.screenshot({ path: `${OUT}/chat-active-${dev}.png` });
      console.log("chat-active", dev, "ok");
    }
    if (token) {
      await ctx.addInitScript((tk) => localStorage.setItem("sb-token", tk as string), token);
      for (const [name, path] of authPages) {
        await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(1800);
        await page.screenshot({ path: `${OUT}/${name}-${dev}.png` });
        console.log(name, dev, "ok");
      }
    }
    await ctx.close();
  }
  await browser.close();
  console.log("全站截图完成");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
