/** 探源页截图：交付页仪式感（/sourcing/1）+ 失败兜底（/sourcing/2）桌面&移动 */
import { chromium } from "playwright-core";
const BASE = "http://localhost:3200";
async function main() {
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
  const shots: Array<[string, string, number]> = [
    ["/sourcing/1", "/tmp/sr1-delivered-desktop.png", 1440],
    ["/sourcing/1", "/tmp/sr1-delivered-mobile.png", 390],
    ["/sourcing/2", "/tmp/sr2-failed-desktop.png", 1440],
  ];
  for (const [path, file, w] of shots) {
    const page = await browser.newPage({ viewport: { width: w, height: 900 } });
    await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2500);
    await page.screenshot({ path: file, fullPage: true });
    console.log("shot", file);
    await page.close();
  }
  await browser.close();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
