// 「我理解的需求」来源行 双端截图验证：npx tsx db/shot-echo.ts
import { chromium } from "playwright-core";

const BASE = "http://localhost:3200";
const MSG = "我要500条瑜伽裤预算8000美元发美国";

async function shotAt(width: number, name: string) {
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.addInitScript(() => { try { localStorage.setItem("sb-lang", "zh"); } catch {} });
  await page.goto(`${BASE}/buyer`, { waitUntil: "networkidle" });
  // 找到输入框发消息（真实点击路径）
  const box = page.getByPlaceholder(/说出你要的品|Name the product/);
  await box.click();
  await box.fill(MSG);
  await page.keyboard.press("Enter");
  // 等来源行出现（最长 60s，LLM 链路）
  const echo = page.getByText("我理解的需求");
  const ok = await echo.waitFor({ timeout: 60_000 }).then(() => true).catch(() => false);
  console.log(`${name}: 来源行${ok ? "已出现" : "未出现"}`);
  // 等卡片渲染稳定
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `shot/${name}.png`, fullPage: false });
  // 额外断言：四个字段徽标都在
  const body = await page.textContent("body");
  console.log(`${name}: 品类徽标=${body?.includes("品类 瑜伽裤")}, 数量=${body?.includes("数量 500")}, 发往=${body?.includes("发往 美国")}, 你说的×${(body?.match(/你说的/g) ?? []).length}`);
  await browser.close();
}

await shotAt(1280, "echo-desktop");
await shotAt(390, "echo-mobile");
