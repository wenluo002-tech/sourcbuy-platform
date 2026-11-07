/// <reference lib="dom" />
import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage();
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE:", m.text().slice(0, 300)); });
page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 500)));
await page.goto("http://localhost:3200/factories", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(5000);
const html = await page.evaluate(() => document.body.innerHTML.slice(0, 300));
console.log("BODY:", JSON.stringify(html));
await browser.close();
process.exit(0);
