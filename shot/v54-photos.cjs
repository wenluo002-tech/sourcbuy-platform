// v54 工厂实拍区验证：id47 相对路径死图→空壳区块应消失；id1 绝对URL→实拍图正常显示
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto("http://localhost:3200/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.setItem("sb-lang", "zh"));

  for (const id of [47, 1]) {
    await page.goto(`http://localhost:3200/factories/${id}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const sectionVisible = await page.locator("text=工厂实拍").count();
    const imgCount = await page.locator("h2:has-text('工厂实拍') ~ div img").count();
    console.log(`厂#${id}: 实拍区块=${sectionVisible > 0 ? "渲染" : "未渲染"} 图片数=${imgCount}`);
    // 滚到实拍区截图
    const h2 = page.locator("h2:has-text('工厂实拍')");
    if (await h2.count()) { await h2.scrollIntoViewIfNeeded(); await page.waitForTimeout(2500); }
    await page.screenshot({ path: `shot/v54-factory-${id}.png` });
  }
  await browser.close();
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
