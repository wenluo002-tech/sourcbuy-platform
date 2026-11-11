// 浏览器实测：注册测试买家 → 临时查厂「广州鸿讯电子有限公司」→ 验证撞库直通卡渲染
import { chromium } from "playwright-core";

const BASE = "http://localhost:3200";
const email = `vetted${Date.now()}@test.com`;
const password = "Test123456!";

// 注册拿 token（token 双通道：响应体回 token）
const reg = await fetch(`${BASE}/api/trpc/auth.register`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ json: { email, password } }),
});
const regJson: any = await reg.json();
const token = regJson?.result?.data?.json?.token;
if (!token) {
  console.log("注册失败:", JSON.stringify(regJson).slice(0, 300));
  process.exit(1);
}
console.log("注册 OK:", email);

const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
await ctx.addInitScript((t) => {
  localStorage.setItem("sb-token", t);
  localStorage.setItem("sb-lang", "zh");
}, token);
const page = await ctx.newPage();
await page.goto(`${BASE}/factories`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('input', { timeout: 30_000 });
// 输入厂名并点击实时核查（缓存命中应秒回）
const desc = await page.locator("text=沉淀进严选库培育档").count();
console.log("入口新文案可见:", desc > 0);
await page.screenshot({ path: "/tmp/tempcheck-entry.png", fullPage: false });
const input = page.locator("input").last();
await input.fill("广州鸿讯电子有限公司");
await page.getByRole("button", { name: /实时核查/ }).click();
// 等报告出现（撞库卡含「查看严选档案」链接）
await page.waitForSelector('text=查看严选档案', { timeout: 60_000 });
await page.waitForTimeout(800);
await page.screenshot({ path: "/tmp/vetted-check.png", fullPage: false });
console.log("撞库卡已渲染，截图 /tmp/vetted-check.png");
await browser.close();
process.exit(0);
