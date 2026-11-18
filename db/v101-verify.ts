// v101 P0 合规修复验收：双端截图 + 真实点击 + 口径断言
import { chromium } from "playwright-core";
import fs from "node:fs";

const BASE = "http://localhost:3200";
const OUT = "/mnt/agents/output/ops/v101-verify";
fs.mkdirSync(OUT, { recursive: true });

const results: string[] = [];
const ok = (name: string, pass: boolean, detail = "") => {
  results.push(`${pass ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
};

async function shoot(page: any, name: string) {
  await page.evaluate(`(async () => {
    await new Promise((res) => {
      let y = 0;
      const step = () => {
        y += 600; window.scrollTo(0, y);
        if (y < document.body.scrollHeight) setTimeout(step, 120);
        else { window.scrollTo(0, 0); setTimeout(res, 400); }
      };
      step();
    });
  })()`);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
}

const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });

for (const [vpName, vp] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]] as const) {
  const ctx = await browser.newContext({ viewport: vp, locale: "zh-CN" });
  const page = await ctx.newPage();

  // 1) 首页：数据墙口径
  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(2500);
  const homeText = await page.evaluate(() => document.body.innerText);
  ok(`${vpName} 首页不含内部数字 7,761/7761`, !/7,?761/.test(homeText));
  ok(`${vpName} 首页含 7,000+ 口径`, homeText.includes("7,000+"));
  ok(`${vpName} 首页五档无精确计数(750/1284/2057/3449)`, !/(^|[^\d])(750|1,?284|2,?057|3,?449)([^\d]|$)/.test(homeText.replace(/Step \d|0[1-3]/g, "")));
  ok(`${vpName} 首页 Top Rated 无裸分(档位后数字)`, !/(金标|银标|铜标|优选|培育)\s*\d{2}\.\d/.test(homeText));
  ok(`${vpName} 首页品类计数保留(有数字)`, /\d{3,}/.test(homeText));
  await shoot(page, `${vpName}-home`);

  // 2) /products 裸路径：404 页
  await page.goto(`${BASE}/products`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1200);
  const nfText = await page.evaluate(() => document.body.innerText);
  ok(`${vpName} /products 不再白屏(渲染404页)`, nfText.includes("这个页面不存在"), nfText.slice(0, 60).replace(/\n/g, " "));
  await shoot(page, `${vpName}-404`);

  // 3) 404 页真实点击：返回首页（精确选择器：页脚也有「返回首页」，text= 会撞车）
  await page.locator('a.sb-pill[href="/"]', { hasText: "返回首页" }).click();
  await page.waitForTimeout(1500);
  ok(`${vpName} 404→返回首页 点击`, page.url() === `${BASE}/`, page.url());

  // 4) 404 页真实点击：发起询价
  await page.goto(`${BASE}/products`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1200);
  await page.locator('a.sb-pill[href="/buyer"]', { hasText: "发起询价" }).click();
  await page.waitForTimeout(1500);
  ok(`${vpName} 404→发起询价 点击`, page.url().startsWith(`${BASE}/buyer`), page.url());

  // 5) 工厂库：计数口径 + 无裸分
  await page.goto(`${BASE}/factories`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(2500);
  const facText = await page.evaluate(() => document.body.innerText);
  ok(`${vpName} 工厂库不含 7,761`, !/7,?761/.test(facText));
  ok(`${vpName} 工厂库含 7,000+`, facText.includes("7,000+"));
  ok(`${vpName} 工厂卡无大裸分(91.8等)`, !/\b9[01]\.\d\b/.test(facText));
  await shoot(page, `${vpName}-factories`);

  // 6) 工厂详情：无右侧大分数
  const firstCard = page.locator('a[href^="/factories/"]').first();
  await firstCard.click();
  await page.waitForTimeout(2000);
  const fdText = await page.evaluate(() => document.body.innerText);
  ok(`${vpName} 工厂详情无裸分`, !/\b9[01]\.\d\b/.test(fdText));
  await shoot(page, `${vpName}-factory-detail`);

  await ctx.close();
}

await browser.close();
fs.writeFileSync(`${OUT}/results.txt`, results.join("\n") + "\n");
console.log(results.join("\n"));
