/// <reference lib="dom" />
// 登录态探针 v2：GBK 编码公司搜索→解析结果卡（年限/回头率/主营/认证/winport/loginId）→验证目标厂命中
import { chromium } from "playwright-core";
import iconv from "iconv-lite";
import fs from "fs";

function gbkUrlEncode(s: string): string {
  return iconv
    .encode(s, "gbk")
    .toString("hex")
    .replace(/(..)/g, "%$1")
    .toUpperCase();
}

const EXCLUDE_WP = /^(www|s|show|m|work|login|page|detail|offer|go|air|sycm|trade|member|payment)$/i;

async function main() {
  const target = process.env.TARGET_NAME ?? "义乌市米尼汽车用品有限公司";
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

  // 1) GBK 编码公司搜索
  const url = `https://s.1688.com/company/company_search.htm?keywords=${gbkUrlEncode(target)}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: "/mnt/agents/output/探针-公司搜索.png" });
  const bodyText = ((await page.textContent("body")) ?? "").replace(/\s+/g, " ");
  console.log("SEARCH-URL:", page.url().slice(0, 110));
  console.log("HAS-TARGET:", bodyText.includes(target.slice(0, 6)));
  console.log("NO-RESULT:", bodyText.includes("没有找到相关的商家"));

  // 2) 提取结果卡：按 DOM 结构逐卡解析
  fs.writeFileSync("/tmp/search-html.txt", await page.content());
  const cards = await page.evaluate(() => {
    // 结果卡是含 .1688.com 链接的容器；找所有指向子域店的 a，向上找卡片容器取文本
    const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href*='.1688.com']"));
    const seen = new Set<string>();
    const out: Array<Record<string, unknown>> = [];
    for (const a of anchors) {
      const m = a.href.match(/https?:\/\/([a-z0-9-]+)\.1688\.com/i);
      if (!m) continue;
      const wp = m[1];
      if (seen.has(wp)) continue;
      seen.add(wp);
      let el: HTMLElement | null = a;
      let cardText = "";
      for (let i = 0; i < 8 && el; i++) {
        el = el.parentElement;
        if (el && (el.innerText ?? "").length > 120) { cardText = (el.innerText ?? "").replace(/\s+/g, " ").slice(0, 600); break; }
      }
      out.push({ wp, href: a.href.slice(0, 90), text: cardText });
    }
    return out;
  });
  console.log("CARDS:", JSON.stringify(cards.slice(0, 8), null, 1));

  // 3) fcaReport loginId 线索
  const loginIds = await page.$$eval("a[href*='fcaReport.htm']", (as) =>
    as.map((a) => (a as HTMLAnchorElement).href).slice(0, 10));
  console.log("FCA-LINKS:", JSON.stringify(loginIds, null, 1));

  await browser.close();
  process.exit(0);
}
main().catch((e) => { console.log("FATAL:", String(e?.message ?? e).slice(0, 300)); process.exit(1); });
