import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.addInitScript(() => localStorage.setItem("sb-lang", "en"));
await page.goto("http://localhost:3200/buyer", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
// 受控 input 无 type 属性，用 placeholder 定位
const input = page.locator('input[placeholder*="Name the product"]');
await input.click();
await input.pressSequentially("What press-on nails are trending? Show me the radar picks", { delay: 8 });
await page.locator('button[type="submit"]').last().click();
console.log("已发送，等待 AI 回复…");
try {
  await page.waitForSelector("text=/Radar|radar/i", { timeout: 90000 });
} catch { console.log("超时，截现状"); }
await page.waitForTimeout(1500);
await page.screenshot({ path: "/tmp/v74-chat2.png" });
const zhLeft = await page.evaluate(() => {
  const texts: string[] = [];
  document.querySelectorAll("p, span, h1, h2, h3, li").forEach((el) => {
    const tx = (el as HTMLElement).innerText?.trim();
    if (tx && /[\u4e00-\u9fff]/.test(tx) && tx.length < 150) texts.push(tx);
  });
  return [...new Set(texts)].slice(0, 10);
});
console.log("AI 回复区残留中文:", JSON.stringify(zhLeft, null, 1));
await browser.close();
process.exit(0);
