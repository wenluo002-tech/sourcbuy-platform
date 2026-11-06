// 匿名（无会话）公司搜索对照测试：判断风控墙是会话绑定还是 IP 绑定
import { chromium } from "playwright-core";
import iconv from "iconv-lite";

function gbkUrlEncode(s: string): string {
  return iconv.encode(s, "gbk").toString("hex").replace(/(..)/g, "%$1").toUpperCase();
}

async function main() {
  const target = process.env.TARGET_NAME ?? "广东宏新源科技有限公司";
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium", headless: true,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-dev-shm-usage"],
  });
  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 }, locale: "zh-CN",
  });
  const page = await ctx.newPage();
  await page.goto(`https://s.1688.com/company/company_search.htm?keywords=${gbkUrlEncode(target)}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(4000);
  const body = ((await page.textContent("body")) ?? "").replace(/\s+/g, " ");
  const cards = await page.$$eval("div.company-offer-card a.company-name", (as) => as.map((a) => (a.textContent ?? "").trim()).slice(0, 8));
  console.log("URL:", page.url().slice(0, 100));
  console.log("PUNISH:", /punish|亲，请完成安全验证|滑动验证|请按住滑块/.test(page.url() + body));
  console.log("HAS-LOGIN-BTN:", body.includes("请登录"));
  console.log("CARDS:", JSON.stringify(cards));
  console.log("HAS-YEARS:", body.includes("回头率"));
  await browser.close();
  process.exit(0);
}
main().catch((e) => { console.log("FATAL:", String(e?.message ?? e).slice(0, 300)); process.exit(1); });
