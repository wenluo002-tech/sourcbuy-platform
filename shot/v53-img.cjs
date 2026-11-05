// v53 图片上传修复验证：①桌面 JPEG 全链路 ②HEIC 显式提示 ③伪装图拦截+提示 ④移动端视口
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push("[console] " + m.text()); });
  page.on("pageerror", (e) => errors.push("[pageerror] " + e.message));

  // 界面切中文，便于核对文案
  await page.goto("http://localhost:3200/buyer", { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.setItem("sb-lang", "zh"));
  await page.reload({ waitUntil: "networkidle" });

  // --- 用例1：普通 JPEG ---
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles("shot/test-photo.jpg");
  await page.waitForTimeout(1200);
  const chip1 = await page.locator("form img.h-10").count();
  console.log("[1 JPEG] 预览 chip:", chip1 === 1 ? "PASS" : "FAIL(" + chip1 + ")");

  // --- 用例2：HEIC（桌面 Chrome 两条解码路径都解不了 → 必须出提示） ---
  await fileInput.setInputFiles({ name: "IMG_1234.heic", mimeType: "image/heic", buffer: Buffer.from("fake-heic") });
  await page.waitForTimeout(1200);
  const bodyText = await page.locator("body").innerText();
  const heicWarn = bodyText.includes("格式我读不了") || bodyText.includes("HEIC");
  const chip2 = await page.locator("form img.h-10").count();
  console.log("[2 HEIC] 显式提示:", heicWarn ? "PASS" : "FAIL", "| 无残留 chip:", chip2 === 0 ? "PASS" : "FAIL");
  await page.screenshot({ path: "shot/v53-fix-2-heic-warning.png" });

  // 关掉提示，回到干净状态
  const dismissBtns = page.locator("form button", { hasText: "移除" });
  if (await dismissBtns.count()) await dismissBtns.first().click();
  await page.waitForTimeout(300);

  // --- 用例3：伪装成图片的文本文件 ---
  await fileInput.setInputFiles({ name: "fake.png", mimeType: "image/png", buffer: Buffer.from("not-a-real-png") });
  await page.waitForTimeout(1200);
  const bodyText3 = await page.locator("body").innerText();
  console.log("[3 伪装图] 显式提示:", bodyText3.includes("格式我读不了") ? "PASS" : "FAIL");
  const dismissBtns2 = page.locator("form button", { hasText: "移除" });
  if (await dismissBtns2.count()) await dismissBtns2.first().click();

  // --- 用例4：JPEG 发送全链路（确认修复没碰坏正常链路） ---
  await fileInput.setInputFiles("shot/test-photo.jpg");
  await page.waitForTimeout(1200);
  await page.locator("form input").nth(1).fill("这款有吗");
  await page.locator('form button[type="submit"]').click();
  try {
    const resp = await page.waitForResponse((r) => r.url().includes("ai.chat") && r.request().method() === "POST", { timeout: 90000 });
    console.log("[4 发送] ai.chat:", resp.status() === 200 ? "PASS(200)" : "FAIL(" + resp.status() + ")");
  } catch { console.log("[4 发送] ai.chat: FAIL(超时)"); }
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "shot/v53-fix-4-sent.png" });

  // --- 用例5：移动端视口（iPhone 尺寸）上传 ---
  const mob = await browser.newPage({ viewport: { width: 390, height: 844 }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });
  await mob.goto("http://localhost:3200/buyer", { waitUntil: "networkidle" });
  await mob.locator('input[type="file"]').setInputFiles("shot/test-photo.jpg");
  await mob.waitForTimeout(1200);
  const chipM = await mob.locator("form img.h-10").count();
  console.log("[5 移动端] 预览 chip:", chipM === 1 ? "PASS" : "FAIL(" + chipM + ")");
  await mob.screenshot({ path: "shot/v53-fix-5-mobile.png" });

  console.log("--- console/pageerror ---");
  errors.forEach((e) => console.log(e));
  console.log(errors.length === 0 ? "(无)" : "");
  await browser.close();
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
