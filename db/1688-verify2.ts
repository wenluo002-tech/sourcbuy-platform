// 补完 1688 SSO 跳转：带已存会话访问 jump 链，让淘宝侧给 1688 侧发会话
import { chromium } from "playwright-core";

async function main() {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium", headless: true,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-dev-shm-usage"],
  });
  const ctx = await browser.newContext({
    storageState: "/mnt/agents/output/app/.1688-session.json",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 }, locale: "zh-CN",
  });
  const page = await ctx.newPage();
  // 先验证淘宝侧会话
  await page.goto("https://my.taobao.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(4000);
  console.log(`TB URL: ${page.url().slice(0, 100)}`);
  const tbOk = !page.url().includes("login.");
  console.log(tbOk ? "TB-SESSION-OK" : "TB-SESSION-REJECTED");
  if (tbOk) {
    // 走 1688 SSO 跳转补发 1688 会话
    await page.goto("https://login.1688.com/member/jump.htm?target=https%3A%2F%2Fwork.1688.com%2Fhome%2Fpage%2Findex.htm", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(6000);
    console.log(`JUMP URL: ${page.url().slice(0, 120)}`);
    await page.goto("https://work.1688.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(5000);
    const url = page.url();
    console.log(`WORK URL: ${url.slice(0, 120)}`);
    const ok = !url.includes("login.");
    console.log(ok ? "SESSION-OK" : "SESSION-REJECTED");
    if (ok) {
      const fs = await import("fs");
      fs.writeFileSync("/mnt/agents/output/app/.1688-session.json", JSON.stringify(await ctx.storageState(), null, 2));
      console.log("SESSION-RESAVED");
    }
    await browser.close();
    process.exit(ok ? 0 : 1);
  }
  await page.screenshot({ path: "/mnt/agents/output/1688登录态验证.png" });
  await browser.close();
  process.exit(1);
}
main().catch((e) => { console.log("FATAL:", String(e?.message ?? e).slice(0, 200)); process.exit(1); });
