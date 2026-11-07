// 交互式完成 1688 风控验证：带已存会话重进登录链→落到验证页→点"获取短信校验码"→
// 等 /mnt/agents/output/app/.sms-code 文件出现（罗总把短信码告诉我后写入）→填入→确定→等跳转→存会话→验证
import { chromium } from "playwright-core";
import fs from "fs";

const SESSION = "/mnt/agents/output/app/.1688-session.json";
const CODEFILE = "/mnt/agents/output/app/.sms-code";
const STATUS = "/mnt/agents/output/app/.1688-sms-status.log";
const log = (m: string) => { fs.appendFileSync(STATUS, `${new Date().toISOString()} ${m}\n`); };

async function main() {
  fs.writeFileSync(STATUS, "");
  if (fs.existsSync(CODEFILE)) fs.unlinkSync(CODEFILE);
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium", headless: true,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-dev-shm-usage"],
  });
  const ctx = await browser.newContext({
    storageState: SESSION,
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 }, locale: "zh-CN",
  });
  const page = await ctx.newPage();
  // 重进登录链：扫码已确认过，带 cookie 访问应直接快进到风控验证页
  await page.goto("https://login.1688.com/member/signin.htm", { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(8000);
  log(`landed: ${page.url().slice(0, 110)}`);
  await page.screenshot({ path: "/mnt/agents/output/1688验证页.png" });

  // 等落到验证页（最多 40s）
  let onVerify = /login_unusual|checkcode|iv_check/.test(page.url());
  for (let i = 0; i < 10 && !onVerify; i++) { await page.waitForTimeout(3000); onVerify = /login_unusual|checkcode|iv_check/.test(page.url()); log(`wait-verify: ${page.url().slice(0, 100)}`); }

  if (onVerify) {
    // 点"获取短信校验码"
    let clicked = false;
    for (const t of ["获取短信校验码", "获取验证码", "获取验证码"]) {
      try { const el = page.locator(`text=${t}`).first(); if (await el.isVisible({ timeout: 2000 })) { await el.click(); clicked = true; log(`sms-click: ${t}`); break; } } catch {}
    }
    if (!clicked) log("sms-button-NOT-FOUND");
    await page.screenshot({ path: "/mnt/agents/output/1688验证页.png" });
    log("WAITING-SMS-CODE");
  } else {
    log(`no-verify-page, url=${page.url().slice(0, 110)}`);
  }

  // 等短信码文件（最多 10 分钟）
  let code: string | null = null;
  for (let i = 0; i < 150; i++) {
    await page.waitForTimeout(4000);
    if (fs.existsSync(CODEFILE)) { code = fs.readFileSync(CODEFILE, "utf8").trim(); if (/^\d{4,8}$/.test(code)) break; code = null; }
    // 页面可能自己跳走了（罗总在手机上完成了验证）
    const u = page.url();
    if (!/login\.(taobao|1688|alibaba)\.com/.test(u)) { log(`SELF-RESOLVED: ${u.slice(0, 100)}`); break; }
  }

  if (code) {
    log(`code-received: ${code.length}位`);
    // 填入验证码
    const inputSels = ["input[placeholder*=验证码]", "input[placeholder*=校验码]", "input[name*=code]", "input[type=tel]", "#J_CheckCode", "input:visible"];
    let filled = false;
    for (const s of inputSels) {
      try { const el = page.locator(s).first(); if (await el.isVisible({ timeout: 1500 })) { await el.fill(code); filled = true; log(`filled: ${s}`); break; } } catch {}
    }
    if (!filled) log("fill-FAILED");
    // 点确定
    for (const t of ["确定", "提交", "验证"]) {
      try { const el = page.locator(`button:has-text("${t}"), a:has-text("${t}"), input[value="${t}"]`).first(); if (await el.isVisible({ timeout: 1500 })) { await el.click(); log(`submit: ${t}`); break; } } catch {}
    }
    // 等跳转出登录域（最多 90s）
    for (let j = 0; j < 18; j++) {
      await page.waitForTimeout(5000);
      const u = page.url();
      if (!/login\.(taobao|1688|alibaba)\.com/.test(u)) { log(`JUMPED: ${u.slice(0, 100)}`); break; }
      if (j % 3 === 2) await page.screenshot({ path: "/mnt/agents/output/1688验证页.png" });
    }
  }

  const finalUrl = page.url();
  fs.writeFileSync(SESSION, JSON.stringify(await ctx.storageState(), null, 2));
  fs.chmodSync(SESSION, 0o600);
  await page.screenshot({ path: "/mnt/agents/output/1688验证页.png" });

  // 终验：访问工作台
  const p2 = await ctx.newPage();
  await p2.goto("https://work.1688.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await p2.waitForTimeout(5000);
  const wurl = p2.url();
  const ok = !wurl.includes("login.");
  log(ok ? `FINAL-OK work=${wurl.slice(0, 60)}` : `FINAL-REJECTED work=${wurl.slice(0, 80)}`);
  if (ok) fs.writeFileSync(SESSION, JSON.stringify(await ctx.storageState(), null, 2));
  await browser.close();
  console.log(ok ? "SESSION-OK" : "SESSION-REJECTED");
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { log(`FATAL: ${String(e?.message ?? e).slice(0, 200)}`); process.exit(1); });
