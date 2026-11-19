/** 诊断：浏览器里发「宠物轮椅 50 台」，打印 chat 响应的 sourcingRequestId + DOM 中探源卡状态 */
import { chromium } from "playwright-core";
async function main() {
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => { try { localStorage.setItem("sb-lang", "zh"); } catch { /* ignore */ } });
  page.on("console", (m) => { if (m.type() === "error") console.log("[console.error]", m.text().slice(0, 200)); });
  page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
  await page.goto("http://localhost:3200/buyer", { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const ta = page.locator("textarea").first();
  await ta.click();
  await ta.fill("宠物轮椅 50 台");
  const chatPromise = page.waitForResponse((r) => r.url().includes("ai.chat"), { timeout: 90000 }).catch(() => null);
  await page.keyboard.press("Enter");
  const chatRes = await chatPromise;
  if (!chatRes) { console.log("chat 响应超时/失败"); }
  else {
    const j: any = await chatRes.json();
    const items = Array.isArray(j) ? j : [j];
    const data = items.find((it: any) => it?.result?.data?.json?.reply)?.result?.data?.json;
    console.log("chat.sourcingRequestId =", data?.sourcingRequestId);
  }
  await page.locator("text=探源进行中").first().waitFor({ state: "visible", timeout: 25000 }).catch(() => {});
  const body = (await page.textContent("body")) ?? "";
  console.log("body 含「探源进行中」:", body.includes("探源进行中"));
  console.log("body 含「SB-SR」:", body.includes("SB-SR"));
  console.log("body 含「真实在售货源」:", body.includes("真实在售货源"));
  const srGet = await page.evaluate(async () => {
    const r = await fetch('/api/trpc/sourcing.get?input=' + encodeURIComponent(JSON.stringify({ json: { id: 270002 } })));
    const j: any = await r.json();
    return j?.result?.data?.json?.status ?? JSON.stringify(j).slice(0, 200);
  });
  console.log("sourcing.get(270002).status =", srGet);
  await page.screenshot({ path: "/mnt/agents/output/v106-debug-sr.png" });
  await browser.close();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
