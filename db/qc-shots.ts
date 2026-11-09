import { chromium } from "playwright-core";
import fs from "node:fs";
const BASE = "http://localhost:3200";
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
async function shot(name: string, path: string, opts: { cookie?: string; mobile?: boolean; wait?: number }) {
  const ctx = await browser.newContext({ viewport: opts.mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 } });
  if (opts.cookie) await ctx.addCookies([{ name: "sb_session", value: opts.cookie, domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(opts.wait ?? 1500);
  await page.screenshot({ path: "/tmp/shots/" + name + ".png", fullPage: false });
  await ctx.close();
  console.log("shot:", name);
}
fs.mkdirSync("/tmp/shots", { recursive: true });
await shot("qc-h5-factory", "/qc/407dbe55b8fb465cbf46daf91fd39ee8dd5c9404", { mobile: true, wait: 2500 });
await shot("ops-workbench", "/ops", { cookie: "ee3a9d6e091d981d15e8318bf73e64d21f2a7bf49341a30d61ba47045bc9be16", wait: 2500 });
await shot("ops-inspection", "/ops/qc/1", { cookie: "ee3a9d6e091d981d15e8318bf73e64d21f2a7bf49341a30d61ba47045bc9be16", wait: 3500 });
await shot("buyer-order-qc", "/orders/480001", { cookie: "a8b79cf765967d517c7440faa9b2b4ee5895d6fab41f03abea4f696906fef876", wait: 2500 });
await browser.close();
