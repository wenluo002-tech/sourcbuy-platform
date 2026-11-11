import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });

// 1) 详情页工厂背书 maskedName（en）
const p1 = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await p1.addInitScript(() => localStorage.setItem("sb-lang", "en"));
await p1.goto("http://localhost:3200/products/920369433114", { waitUntil: "domcontentloaded" });
await p1.waitForFunction(() => !document.body.innerText.includes("Connecting to source factories"), { timeout: 60000 });
await p1.waitForTimeout(2500);
const behind1 = await p1.evaluate(() => {
  const el = Array.from(document.querySelectorAll("a")).find((a) => a.getAttribute("href")?.startsWith("/factories/"));
  return el?.innerText?.trim() ?? "(not found)";
});
console.log("EN 工厂背书名:", behind1);
await p1.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await p1.waitForTimeout(500);
await p1.screenshot({ path: "/tmp/v74-detail-behind.png" });
await p1.close();

// 2) 工厂档案页 maskedName（es）
const p2 = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await p2.addInitScript(() => localStorage.setItem("sb-lang", "es"));
const href = await p1; // noop
await p2.goto("http://localhost:3200/products/920369433114", { waitUntil: "domcontentloaded" });
await p2.waitForFunction(() => !document.body.innerText.includes("Conectando"), { timeout: 60000 });
await p2.waitForTimeout(2000);
const factHref = await p2.evaluate(() => {
  const el = Array.from(document.querySelectorAll("a")).find((a) => a.getAttribute("href")?.startsWith("/factories/"));
  return el?.getAttribute("href") ?? null;
});
console.log("工厂链接:", factHref);
if (factHref) {
  await p2.goto("http://localhost:3200" + factHref, { waitUntil: "domcontentloaded" });
  await p2.waitForSelector("h1", { timeout: 30000 });
  await p2.waitForTimeout(1500);
  console.log("ES 工厂档案 H1:", await p2.evaluate(() => document.querySelector("h1")?.innerText?.trim()));
  await p2.screenshot({ path: "/tmp/v74-factory-es.png" });
}
await browser.close();
process.exit(0);
