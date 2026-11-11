import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
await page.addInitScript(() => localStorage.setItem("sb-lang", "en"));
const prefill = encodeURIComponent('I saw "Handmade Press-on Nails" on the best-seller radar — find me matching factories and the landed cost');
await page.goto(`http://localhost:3200/buyer?radar=2&prefill=${prefill}`, { waitUntil: "domcontentloaded" });
console.log("CTA 直达，自动发送中…");
await page.waitForFunction(() => !document.body.innerText.includes("working"), { timeout: 150000 });
await page.waitForTimeout(1500);
// 滚到商品卡位置
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.6));
await page.waitForTimeout(600);
await page.screenshot({ path: "/tmp/v74-mobile-card2.png" });
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
