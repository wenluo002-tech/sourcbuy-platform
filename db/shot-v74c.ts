import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.addInitScript(() => localStorage.setItem("sb-lang", "en"));
await page.goto("http://localhost:3200/buyer?radar=2", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
const input = page.locator('[placeholder*="Name the product"], [placeholder*="产品"], textarea').first();
await input.click();
await input.pressSequentially('I saw "Handmade Press-on Nails" on the best-seller radar — find me matching factories and the landed cost', { delay: 5 });
await page.locator('button:has-text("Send"), button:has-text("发送")').first().click();
try {
  await page.waitForSelector("text=/available|在售/i", { timeout: 90000 });
} catch { console.log("没等到商品卡，截现状"); }
await page.waitForTimeout(1500);
await page.screenshot({ path: "/tmp/v74-chat.png", fullPage: false });
const zhLeft = await page.evaluate(() => {
  const texts: string[] = [];
  document.querySelectorAll("p, span, h1, h2, h3, button, a").forEach((el) => {
    const tx = (el as HTMLElement).innerText?.trim();
    if (tx && /[\u4e00-\u9fff]/.test(tx) && tx.length < 120) texts.push(tx);
  });
  return [...new Set(texts)].slice(0, 12);
});
console.log("页面残留中文片段:", JSON.stringify(zhLeft, null, 1));
await browser.close();
process.exit(0);
