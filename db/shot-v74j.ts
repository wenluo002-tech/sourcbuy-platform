import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const p = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await p.addInitScript(() => localStorage.setItem("sb-lang", "en"));
await p.goto("http://localhost:3200/products/840699102922", { waitUntil: "domcontentloaded" });
await p.waitForFunction(() => !document.body.innerText.includes("Connecting to source factories"), { timeout: 60000 });
for (let i = 0; i < 8; i++) {
  await p.waitForTimeout(6000);
  const zhLeft = await p.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll("td, th").forEach((el) => {
      const tx = (el as HTMLElement).innerText?.trim();
      if (tx && /[\u4e00-\u9fff]/.test(tx)) out.push(tx.slice(0, 60));
    });
    return [...new Set(out)].length;
  });
  console.log(`t+${(i + 1) * 6}s SKU 中文残留条数:`, zhLeft);
  if (zhLeft === 0) break;
}
await p.screenshot({ path: "/tmp/v74-detail-sku-en.png" });
await browser.close();
process.exit(0);
