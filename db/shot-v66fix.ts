// v66-hotfix 最终目检：手机视口四页（首页/对话页/工厂库/雷达）+ 桌面首页
/// <reference lib="dom" />
import { chromium, devices } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const mob = await browser.newContext({ ...devices["Pixel 7"], locale: "zh-CN" });
const mp = await mob.newPage();

for (const [path, name] of [["/", "home"], ["/buyer", "chat"], ["/factories", "factories"], ["/radar", "radar"]] as const) {
  await mp.goto(`http://localhost:3200${path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await mp.waitForTimeout(2500);
  await mp.screenshot({ path: `/tmp/v66fix-m-${name}.png` });
  console.log("✓ mobile", name);
}
await mob.close();

const desk = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "zh-CN" });
const dp = await desk.newPage();
await dp.goto("http://localhost:3200/", { waitUntil: "domcontentloaded", timeout: 30000 });
await dp.waitForTimeout(2000);
await dp.screenshot({ path: "/tmp/v66fix-d-home.png" });
console.log("✓ desktop home");
await browser.close();
console.log("done");
