// 1688 账密登录（罗总授权，凭证在 .env）：密码登录→风控短信验证→读 .sms-code→提交→存会话→终验
// 全自动重试能力强：无需扫码；短信码由罗总转发后写入 /mnt/agents/output/app/.sms-code
import { chromium } from "playwright-core";
import fs from "fs";

const SESSION = "/mnt/agents/output/app/.1688-session.json";
const CODEFILE = "/mnt/agents/output/app/.sms-code";
const STATUS = "/mnt/agents/output/app/.1688-pw-login.log";
const log = (m: string) => { fs.appendFileSync(STATUS, `${new Date().toISOString()} ${m}\n`); };

async function clickText(page: any, texts: string[], scope = "page"): Promise<boolean> {
  const frames = scope === "frames" ? page.frames() : [page];
  for (const f of frames) {
    for (const t of texts) {
      try { const el = f.locator(`text=${t}`).first(); if (await el.isVisible({ timeout: 600 })) { await el.click({ force: true }); return true; } } catch {}
    }
  }
  return false;
}

async function main() {
  process.loadEnvFile();
  const USER = process.env.ALI_1688_USER!, PASS = process.env.ALI_1688_PASS!;
  if (!USER || !PASS) { log("FATAL: 凭证缺失"); process.exit(1); }
  fs.writeFileSync(STATUS, "");
  if (fs.existsSync(CODEFILE)) fs.unlinkSync(CODEFILE);

  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium", headless: true,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-dev-shm-usage"],
  });
  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 }, locale: "zh-CN",
  });
  await ctx.addInitScript(() => { Object.defineProperty(navigator, "webdriver", { get: () => undefined }); });
  const page = await ctx.newPage();

  await page.goto("https://login.1688.com/member/signin.htm", { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(5000);
  log(`landed: ${page.url().slice(0, 60)}`);

  // 切到密码登录
  const switched = await clickText(page, ["密码登录", "账号密码登录", "账户密码登录"], "frames");
  log(`switch-pw: ${switched}`);
  await page.waitForTimeout(2500);

  // 填账号密码（全 frame 找输入框）
  let filled = false;
  for (const f of page.frames()) {
    try {
      const u = f.locator("input[name*=loginId], input[placeholder*=会员名], input[placeholder*=手机号], input[placeholder*=邮箱], input[type=text]:visible").first();
      const p = f.locator("input[type=password]").first();
      if (await u.isVisible({ timeout: 800 }) && await p.isVisible({ timeout: 800 })) {
        await u.fill(USER); await p.fill(PASS); filled = true;
        log(`filled @frame ${f.url().slice(0, 50)}`);
        break;
      }
    } catch {}
  }
  if (!filled) { log("FATAL: 找不到账密输入框"); await page.screenshot({ path: "/mnt/agents/output/1688验证页.png" }); await browser.close(); process.exit(1); }
  await page.waitForTimeout(800);

  // 点登录
  const submitted = await clickText(page, ["登录", "登 录", "同意协议并登录"], "frames");
  log(`submit-login: ${submitted}`);
  await page.waitForTimeout(6000);
  await page.screenshot({ path: "/mnt/agents/output/1688验证页.png" });
  log(`after-login: ${page.url().slice(0, 90)}`);

  // 可能遇到：滑块 / 短信验证 / 直接成功
  // 滑块检测
  const bodyNow = (await page.textContent("body")) ?? "";
  if (/滑块|拖动|滑动验证/.test(bodyNow)) log("SLIDER-DETECTED（如需人工滑块会卡在这里）");

  // 若在风控/验证页：点获取短信码
  for (let k = 0; k < 6; k++) {
    const u = page.url();
    if (!/login\.(taobao|1688|alibaba)\.com/.test(u)) break;
    const clicked = await clickText(page, ["获取短信校验码", "获取验证码", "获取动态码"], "frames");
    if (clicked) { log("sms-click: ok"); break; }
    await page.waitForTimeout(3000);
  }
  await page.screenshot({ path: "/mnt/agents/output/1688验证页.png" });
  log("WAITING-SMS-CODE");

  // 等短信码（最多 12 分钟）
  let code: string | null = null;
  for (let k = 0; k < 180; k++) {
    await page.waitForTimeout(4000);
    if (fs.existsSync(CODEFILE)) { const c = fs.readFileSync(CODEFILE, "utf8").trim(); if (/^\d{4,8}$/.test(c)) { code = c; break; } }
    if (!/login\.(taobao|1688|alibaba)\.com/.test(page.url())) { log("NO-SMS-NEEDED: 直接登录成功"); break; }
  }

  if (code) {
    log(`code-received: ${code.length}位`);
    let codeFilled = false;
    for (const f of page.frames()) {
      for (const s of ["input[placeholder*=校验码]", "input[placeholder*=验证码]", "input[name*=code]", "input[name*=Code]", "input[type=tel]"]) {
        try { const el = f.locator(s).first(); if (await el.isVisible({ timeout: 400 })) { await el.fill(code); codeFilled = true; break; } } catch {}
      }
      if (codeFilled) break;
    }
    log(`code-filled: ${codeFilled}`);
    let ok = false;
    for (const f of page.frames()) {
      try {
        const btn = f.locator('button, a, input[type=button], input[type=submit]').filter({ hasText: /确\s*定|提\s*交|验\s*证/ }).first();
        if (await btn.isVisible({ timeout: 400 })) { await btn.click({ force: true }); ok = true; log("submit: regex-btn"); break; }
      } catch {}
      try {
        const inp = f.locator('input[value*=确], input[value*=提], input[value*=验]').first();
        if (await inp.isVisible({ timeout: 300 })) { await inp.click({ force: true }); ok = true; log("submit: input[value]"); break; }
      } catch {}
    }
    if (!ok) {
      for (const f of page.frames()) {
        try { const el = f.locator("input[placeholder*=验证码], input[placeholder*=校验码]").first(); if (await el.isVisible({ timeout: 300 })) { await el.press("Enter"); ok = true; log("submit: Enter"); break; } } catch {}
      }
    }
    if (!ok) log("submit-FAILED");
  } else log("code-TIMEOUT 或无需验证码");

  // 等跳转出登录域（最多 90s）
  let u = page.url();
  for (let j = 0; j < 18; j++) {
    await page.waitForTimeout(5000);
    u = page.url();
    if (!/login\.(taobao|1688|alibaba)\.com/.test(u)) break;
    if (j % 3 === 2) await page.screenshot({ path: "/mnt/agents/output/1688验证页.png" });
  }
  fs.writeFileSync(SESSION, JSON.stringify(await ctx.storageState(), null, 2));
  fs.chmodSync(SESSION, 0o600);
  log(/login\.(taobao|1688|alibaba)\.com/.test(u) ? `STUCK url=${u.slice(0, 90)}` : `LOGGED-IN url=${u.slice(0, 90)}`);

  // 终验
  const p2 = await ctx.newPage();
  await p2.goto("https://work.1688.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await p2.waitForTimeout(5000);
  const wurl = p2.url();
  if (!wurl.includes("login.")) {
    fs.writeFileSync(SESSION, JSON.stringify(await ctx.storageState(), null, 2));
    log(`FINAL-OK work=${wurl.slice(0, 60)}`);
  } else log(`FINAL-REJECTED work=${wurl.slice(0, 80)}`);
  await browser.close();
  process.exit(0);
}
main().catch((e) => { log(`FATAL: ${String(e?.message ?? e).slice(0, 200)}`); process.exit(1); });
