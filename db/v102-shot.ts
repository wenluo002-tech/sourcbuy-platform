import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
for (const [name, vp] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]] as const) {
  const page = await (await browser.newContext({ viewport: vp, locale: "zh-CN" })).newPage();
  await page.goto("http://localhost:3200/", { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(2500);
  const wall = page.locator("text=严选在册规模").first();
  await wall.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `/mnt/agents/output/ops/v101-verify/${name}-wall-v102.png` });
  // 口径断言
  const txt = await page.evaluate(() => document.body.innerText);
  const has = (s: string) => txt.includes(s);
  console.log(name, JSON.stringify({
    total: has("7,000+"), gold: has("200+"), silver: has("700+"), bronze: has("1,200+"),
    rising: has("2,000+"), new_: has("3,400+"),
    leakPrecise: /7,?761|金标\s*221|银标\s*750|1,?284|2,?057|3,?449/.test(txt),
  }));
  await page.context().close();
}
await browser.close();
