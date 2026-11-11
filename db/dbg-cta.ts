import { chromium } from "playwright-core";
const PREFILL = encodeURIComponent('I saw "Handmade Press-on Nails" on the best-seller radar — find me matching factories and the landed cost');
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const ctx = await browser.newContext();
await ctx.addInitScript((l) => localStorage.setItem("sb-lang", l), "es");
const page = await ctx.newPage();
await page.goto(`http://localhost:3200/buyer?radar=2&prefill=${PREFILL}`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('a[href^="/products/"]', { timeout: 150_000 });
await page.waitForTimeout(1500);
const hits = await page.evaluate(() => {
  const RE = /[\u4e00-\u9fff]/;
  const out: string[] = [];
  document.querySelectorAll("body *").forEach((el) => {
    if (el.closest("[data-i18n-skip]")) return;
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType === 3) {
        const tx = n.textContent?.trim();
        if (tx && RE.test(tx)) out.push(tx);
      }
    }
  });
  return [...new Set(out)];
});
console.log(JSON.stringify(hits, null, 2));
await browser.close();
process.exit(0);
