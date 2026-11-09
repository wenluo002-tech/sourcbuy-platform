import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
for (const [w, name] of [[1280, "echo2-desktop"], [390, "echo2-mobile"]] as const) {
  const page = await browser.newPage({ viewport: { width: w, height: 800 } });
  await page.addInitScript(() => { try { localStorage.setItem("sb-lang", "zh"); } catch {} });
  await page.goto("http://localhost:3200/buyer", { waitUntil: "networkidle" });
  const box = page.getByPlaceholder(/说出你要的品/);
  await box.click();
  await box.fill("我要500条瑜伽裤预算8000美元发美国");
  await page.keyboard.press("Enter");
  await page.getByText("我理解的需求").waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  await page.getByText("我理解的需求").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `shot/${name}.png` });
  console.log(`${name} ok`);
}
await browser.close();
