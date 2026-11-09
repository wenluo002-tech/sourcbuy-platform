// v71 验证：①移动端主图滑动手势 ②英文版商品标题翻译 ③西语界面
import { chromium } from "playwright-core";
const BASE = "http://localhost:3200";
const OFFER = "931697698419"; // 商品池真实在售货（儿童自行车）

const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });

// ① 移动端滑动：CDP 触屏事件模拟左滑/右滑
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await page.goto(`${BASE}/products/${OFFER}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const img = page.locator("img.aspect-square").first(); // 主图（img 自身带宽高比类）
  const before = await img.getAttribute("src");
  const box = (await img.boundingBox())!;
  const y = box.y + box.height / 2;
  // 左滑（应切到下一张）
  await page.touchscreen.tap(box.x + box.width / 2, y); // 先确保触摸上下文
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x + box.width - 30, y }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: box.x + 40, y }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(600);
  const afterLeft = await img.getAttribute("src");
  console.log("左滑换图:", before !== afterLeft ? "PASS" : "FAIL", "|", before?.slice(-30), "→", afterLeft?.slice(-30));
  // 右滑（应切回）
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x + 40, y }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: box.x + box.width - 30, y }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(600);
  const afterRight = await img.getAttribute("src");
  console.log("右滑回图:", afterRight === before ? "PASS" : "FAIL");
  await page.screenshot({ path: "shot/v71-swipe.png" });
  await page.close();
}

// ② 英文版详情页：标题应翻译成英文（缓存已热，秒回）
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => { try { localStorage.setItem("sb-lang", "en"); } catch {} });
  await page.goto(`${BASE}/products/${OFFER}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  const h1 = await page.locator("h1").first().textContent();
  console.log("英文版标题:", h1?.slice(0, 80), "| 无中文:", !/[一-鿿]/.test(h1 ?? "") ? "PASS" : "FAIL");
  await page.screenshot({ path: "shot/v71-en-detail.png" });
  await page.close();
}

// ③ 西语界面：导航+首页 hero 应为西语
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.addInitScript(() => { try { localStorage.setItem("sb-lang", "es"); } catch {} });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  const body = await page.textContent("body");
  console.log("西语界面: hero 西语:", /Compra|compra|fábrica/i.test(body ?? "") ? "PASS" : "CHECK", "| 语言选择器:", (await page.locator("select[aria-label]").count()) > 0 ? "PASS" : "FAIL");
  await page.screenshot({ path: "shot/v71-es-home.png" });
  await page.close();
}

await browser.close();
