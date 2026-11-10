// 验证首页五语言选择器（罗总反馈：首页仍只有中英）
import { chromium } from "playwright-core";

const BASE = "http://localhost:3200";
const shot = async (name: string, lang: string | null, check: (page: any) => Promise<void>) => {
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 800 } });
  if (lang) await ctx.addInitScript((l) => localStorage.setItem("sb-lang", l), lang);
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1200);
  await check(page);
  await page.screenshot({ path: `/mnt/agents/output/app/db/shots/${name}.png` });
  await browser.close();
};

// 场景1：中文界面，导航应是五语言 select
await shot("v72-nav-zh", "zh", async (page) => {
  const sel = page.locator("header select[aria-label='Switch language']");
  const count = await sel.count();
  const opts = count ? await sel.locator("option").allTextContents() : [];
  console.log("select 存在:", count > 0, "选项:", JSON.stringify(opts));
  if (opts.length !== 5) throw new Error("FAIL: 语言选项不是 5 个");
  console.log("PASS 五语言选择器");
});

// 场景2：切西语，hero 应变西文
await shot("v72-nav-es", "es", async (page) => {
  const body = await page.locator("h1").first().textContent();
  console.log("ES hero:", body?.slice(0, 60));
  if (!body || /[\u4e00-\u9fff]/.test(body)) throw new Error("FAIL: 西语界面 hero 仍含中文");
  console.log("PASS 西语界面");
});
console.log("ALL PASS");
