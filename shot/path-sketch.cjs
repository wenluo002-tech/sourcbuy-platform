const { chromium } = require("playwright-core");
(async () => {
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("sb-lang", "zh"); } catch {} });
  const page = await ctx.newPage();
  const shots = [
    ["/", "ps1-home"],
    ["/verify", "ps2-verify"],
    ["/buyer", "ps3-buyer"],
    ["/radar", "ps4-radar"],
  ];
  for (const [path, name] of shots) {
    await page.goto("http://localhost:3200" + path, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `shot/${name}.png`, fullPage: path === "/" });
    console.log(name, "ok");
  }
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
