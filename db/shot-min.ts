/// <reference lib="dom" />
import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto("http://localhost:3200/factories", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(6000);
await page.screenshot({ path: "/tmp/min.png" });
console.log("done");
await browser.close();
process.exit(0);
