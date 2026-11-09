// 模拟 iframe 预览场景：登录后清掉 cookie（等效浏览器拦截第三方 cookie），验证 token 通道仍保持登录态
import { chromium } from "playwright-core";

const BASE = "http://localhost:3200";
const OUT = "/tmp/shots";
const EMAIL = "m4atest1794109068991@test.com";
const PASS = "Test1234!";

async function main() {
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "zh-CN" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));

  // 1. 匿名 /factories：应见「登录后免费实时核查」
  await page.goto(BASE + "/factories", { waitUntil: "networkidle" });
  const anonLink = await page.locator('a:has-text("登录后免费实时核查")').count();
  console.log("① 匿名见登录链接:", anonLink === 1);

  // 2. 从核查区块点登录（带 next 回跳）
  await page.locator('a:has-text("登录后免费实时核查")').click();
  await page.waitForURL("**/login**");
  console.log("② 跳转登录页带 next:", page.url().includes("next=%2Ffactories"));

  // 3. 登录
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/factories**", { timeout: 15000 }).catch(() => console.log("!! 未回跳 /factories:", page.url()));
  await page.waitForTimeout(2000);
  const nav1 = await page.locator("header").innerText();
  console.log("③ 登录后回跳 /factories:", page.url().includes("/factories"), "| 导航显示已登录:", nav1.includes("工作台") || nav1.includes("退出"));
  await page.screenshot({ path: `${OUT}/f1-logged-in.png` });

  // 4. 模拟浏览器拦截第三方 cookie：清空全部 cookie，刷新页面
  await ctx.clearCookies();
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  const nav2 = await page.locator("header").innerText();
  console.log("④ 清 cookie 刷新后仍登录（token 通道）:", nav2.includes("工作台") || nav2.includes("退出"));
  await page.screenshot({ path: `${OUT}/f2-no-cookie-still-login.png` });

  // 5. 无 cookie 状态下实际跑一次实时核查
  await page.fill('input[placeholder*="公司全名"]', "深圳市鑫创纪元科技有限公司");
  await page.locator('button:has-text("实时核查")').click();
  await page.waitForTimeout(15000);
  const body = await page.locator("body").innerText();
  const gotReport = body.includes("实时初核") || body.includes("初核");
  console.log("⑤ 无 cookie 核查出结果:", gotReport, "| 未登录拦截:", body.includes("登录后免费"));
  await page.screenshot({ path: `${OUT}/f3-tempcheck-result.png`, fullPage: false });

  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
