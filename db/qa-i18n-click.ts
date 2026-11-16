// ka 语言切换双端真实点击测试（罗总硬规矩：交互改动双端实测）
import { chromium } from "playwright-core";
const KA_RE = /[Ⴀ-ᇿⴀ-ⴟ]/u;
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
let pass = 0, fail = 0;
const check = (name: string, ok: boolean) => { console.log(`${ok ? "✓" : "✗"} ${name}`); ok ? pass++ : fail++; };

for (const [dev, vp] of [["桌面 1280×900", { width: 1280, height: 900 }], ["移动 390×844", { width: 390, height: 844 }]] as const) {
  const ctx = await browser.newContext({ viewport: vp, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36" });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3200/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2500);

  // 1. 语言选择器存在且含 KA 选项
  const sel = page.locator("select[aria-label='Switch language']");
  check(`${dev} 语言选择器存在`, await sel.count() === 1);
  const options = await sel.locator("option").allTextContents();
  check(`${dev} 选择器含 KA 选项（${options.join("/")}）`, options.includes("KA"));

  // 2. 真实点击切换到 KA（selectOption 模拟用户选择行为）
  await sel.selectOption("ka");
  await page.waitForTimeout(1500);
  const bodyKa = await page.evaluate(() => document.body.innerText);
  check(`${dev} 切 KA 后页面渲染格鲁吉亚文`, KA_RE.test(bodyKa));
  const htmlLang = await page.evaluate(() => document.documentElement.lang);
  check(`${dev} <html lang>=ka`, htmlLang === "ka");

  // 3. 持久化：刷新后保持 ka
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const bodyAfter = await page.evaluate(() => document.body.innerText);
  check(`${dev} 刷新后保持格鲁吉亚语`, KA_RE.test(bodyAfter));

  // 4. 切回中文恢复正常
  await sel.selectOption("zh");
  await page.waitForTimeout(1500);
  const bodyZh = await page.evaluate(() => document.body.innerText);
  check(`${dev} 切回中文正常`, /中文|发送|严选/.test(bodyZh) && !KA_RE.test(bodyZh.slice(0, 500)));
  await ctx.close();
}
console.log(`RESULT ${pass} PASS / ${fail} FAIL`);
await browser.close();
process.exit(fail ? 1 : 0);
