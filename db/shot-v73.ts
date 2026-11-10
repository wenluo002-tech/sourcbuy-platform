import { chromium } from "playwright-core";
async function shot(lang: string, path: string) {
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((l) => localStorage.setItem("sb-lang", l), lang);
  const page = await ctx.newPage();
  await page.goto("http://localhost:3200/", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path });
  await browser.close();
  console.log(`${lang} 截图完成`);
}
(async () => {
  await shot("zh", "/tmp/v73-hero-zh.png");
  await shot("en", "/tmp/v73-hero-en.png");
  await shot("es", "/tmp/v73-hero-es.png");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
