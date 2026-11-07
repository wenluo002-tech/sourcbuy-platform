// 验证 1688 登录态：带 storageState 访问需登录的页面，看是否被踢回登录页
import { chromium } from "playwright-core";
import fs from "fs";

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
  // work.1688.com 是卖家工作台首页，未登录必跳登录页
  await page.goto("https://work.1688.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(5000);
  const url = page.url();
  const title = await page.title();
  console.log(`URL: ${url}`);
  console.log(`TITLE: ${title}`);
  const bodyText = (await page.textContent("body"))?.slice(0, 300) ?? "";
  console.log(`BODY: ${bodyText.replace(/\s+/g, " ").slice(0, 200)}`);
  await page.screenshot({ path: "/mnt/agents/output/1688登录态验证.png" });
  const ok = !url.includes("login.") && !url.includes("signin");
  console.log(ok ? "SESSION-OK" : "SESSION-REJECTED");
  await browser.close();
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.log("FATAL:", String(e?.message ?? e).slice(0, 200)); process.exit(1); });
