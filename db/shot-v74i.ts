import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });

// 1) 详情页工厂背书 maskedName（en）——有严选厂的商品
const p1 = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await p1.addInitScript(() => localStorage.setItem("sb-lang", "en"));
await p1.goto("http://localhost:3200/products/840699102922", { waitUntil: "domcontentloaded" });
await p1.waitForFunction(() => !document.body.innerText.includes("Connecting to source factories"), { timeout: 60000 });
await p1.waitForTimeout(2500);
const behind = await p1.evaluate(() => {
  const el = Array.from(document.querySelectorAll("a")).find((a) => a.getAttribute("href")?.startsWith("/factories/"));
  return { name: el?.innerText?.trim() ?? "(not found)", href: el?.getAttribute("href") };
});
console.log("EN 工厂背书:", JSON.stringify(behind));
// 全页中文残留
const zh1 = await p1.evaluate(() => {
  const out: string[] = [];
  document.querySelectorAll("p, span, li, h1, h2, h3, a, td, th, button").forEach((el) => {
    const tx = (el as HTMLElement).innerText?.trim();
    if (tx && /[\u4e00-\u9fff]/.test(tx) && tx.length < 120) out.push(tx);
  });
  return [...new Set(out)].slice(0, 12);
});
console.log("EN 详情页残留:", JSON.stringify(zh1));
if (behind.href) {
  await p1.evaluate((h) => { document.querySelector(`a[href="${h}"]`)?.scrollIntoView({ block: "center" }); }, behind.href);
  await p1.waitForTimeout(400);
  await p1.screenshot({ path: "/tmp/v74-detail-behind2.png" });
}
await p1.close();

// 2) 工厂档案页 H1 maskedName（es）
const p2 = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await p2.addInitScript(() => localStorage.setItem("sb-lang", "es"));
await p2.goto("http://localhost:3200/factories/208", { waitUntil: "domcontentloaded" });
await p2.waitForSelector("h1", { timeout: 30000 });
await p2.waitForTimeout(1500);
console.log("ES 工厂档案 H1:", await p2.evaluate(() => document.querySelector("h1")?.innerText?.trim()));
await p2.screenshot({ path: "/tmp/v74-factory-es.png" });
await browser.close();
process.exit(0);
