import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
// 移动端视口（罗总手机实测场景）
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
await page.addInitScript(() => localStorage.setItem("sb-lang", "en"));
await page.goto("http://localhost:3200/buyer?radar=2", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
const input = page.locator('input[placeholder*="Name the product"]');
await input.click();
await input.pressSequentially("find me matching factories and the landed cost", { delay: 8 });
await page.locator('button[type="submit"]').last().click();
console.log("已发送（radarCtx=手工穿戴甲）");
await page.waitForFunction(() => !document.body.innerText.includes("working"), { timeout: 120000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: "/tmp/v74-mobile-card.png" });
const zhLeft = await page.evaluate(() => {
  const texts: string[] = [];
  document.querySelectorAll("p, span, li, h1, h2, h3").forEach((el) => {
    const tx = (el as HTMLElement).innerText?.trim();
    if (tx && /[\u4e00-\u9fff]/.test(tx) && tx.length < 150) texts.push(tx);
  });
  return [...new Set(texts)].slice(0, 10);
});
console.log("残留中文:", JSON.stringify(zhLeft, null, 1));
await browser.close();
process.exit(0);
