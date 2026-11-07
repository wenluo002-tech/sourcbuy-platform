// 1688 扫码登录：打开登录页→截二维码→轮询登录态→落 storageState
// 会话文件 .1688-session.json 是凭证：只在服务端，绝不入记忆、绝不入 git
import { chromium } from "playwright-core";
import fs from "fs";

const QR = "/mnt/agents/output/1688登录二维码.png";
const FULL = "/mnt/agents/output/1688登录页.png";
const SESSION = "/mnt/agents/output/app/.1688-session.json";
const STATUS = "/mnt/agents/output/app/.1688-login-status.log";

const log = (m: string) => { fs.appendFileSync(STATUS, `${new Date().toISOString()} ${m}\n`); };

async function shot(page: any) {
  // 优先只截二维码元素，找不到再整页
  const sels = ["#J_QRCodeImg", ".qrcode-img", "img.qrcode", "[class*=qrcode] img", "[class*=QRCode] img", "#login-qrcode img"];
  for (const s of sels) {
    try {
      const el = await page.$(s);
      if (el && await el.isVisible()) { await el.screenshot({ path: QR }); return "element:" + s; }
    } catch {}
  }
  await page.screenshot({ path: QR, fullPage: false });
  return "viewport";
}

async function main() {
  fs.writeFileSync(STATUS, "");
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
  await page.screenshot({ path: FULL, fullPage: false });
  log(`landed: ${page.url()}`);

  // 若默认是账密表单，点"扫码登录"切换
  for (const t of ["扫码登录", "扫码安全登录", "二维码登录"]) {
    try { const el = page.locator(`text=${t}`).first(); if (await el.isVisible({ timeout: 1500 })) { await el.click(); log(`clicked: ${t}`); await page.waitForTimeout(2500); break; } } catch {}
  }
  // 登录页可能在 iframe 里
  let target: any = page;
  for (const f of page.frames()) {
    try { if (await f.$("#J_QRCodeImg, [class*=qrcode] img")) { target = f; log(`qr in iframe: ${f.url().slice(0, 80)}`); break; } } catch {}
  }
  const how = await shot(target);
  log(`qr-shot: ${how}`);

  // 轮询登录态：最多 15 分钟；每 4s 检查过期遮罩，刷新后立刻重截二维码
  let lastShot = Date.now();
  for (let i = 0; i < 220; i++) {
    await page.waitForTimeout(4000);
    const url = page.url();
    const cookies = await ctx.cookies();
    const hasKey = cookies.some((c) => c.name === "cookie2" || c.name === "sgcookie");
    if (hasKey && !url.includes("signin") && !url.includes("login.taobao.com/?")) {
      // 扫码已确认：若落在风控验证页（login_unusual），原地完成短信验证
      log(`SCANNED url=${url.slice(0, 80)}`);
      await page.waitForTimeout(4000);
      let u = page.url();
      if (/login_unusual|iv_check|checkcode/.test(u)) {
        log("VERIFY-PAGE: 全 frame 轮询短信按钮");
        // 全 frame 轮询"获取短信校验码"按钮，最多 40s（页面可能晚渲染或套 iframe）
        let clicked = false;
        for (let k = 0; k < 20 && !clicked; k++) {
          for (const f of page.frames()) {
            for (const t of ["获取短信校验码", "获取验证码", "获取动态码"]) {
              try { const el = f.locator(`text=${t}`).first(); if (await el.isVisible({ timeout: 300 })) { await el.click({ force: true }); clicked = true; log(`sms-click: ${t} @frame ${f.url().slice(0, 50)}`); break; } } catch {}
            }
            if (clicked) break;
          }
          if (!clicked) await page.waitForTimeout(2000);
        }
        if (!clicked) log("sms-button-NOT-FOUND");
        await page.screenshot({ path: "/mnt/agents/output/1688验证页.png" });
        log("WAITING-SMS-CODE");
        // 等短信码文件（最多 10 分钟）
        const CODEFILE = "/mnt/agents/output/app/.sms-code";
        if (fs.existsSync(CODEFILE)) fs.unlinkSync(CODEFILE);
        let code: string | null = null;
        for (let k = 0; k < 150; k++) {
          await page.waitForTimeout(4000);
          if (fs.existsSync(CODEFILE)) { const c = fs.readFileSync(CODEFILE, "utf8").trim(); if (/^\d{4,8}$/.test(c)) { code = c; break; } }
          if (!/login\.(taobao|1688|alibaba)\.com/.test(page.url())) { log("SELF-RESOLVED"); break; }
        }
        if (code) {
          log(`code-received: ${code.length}位`);
          let filled = false;
          for (const f of page.frames()) {
            for (const s of ["input[placeholder*=校验码]", "input[placeholder*=验证码]", "input[name*=code]", "input[name*=Code]", "input[type=tel]"]) {
              try { const el = f.locator(s).first(); if (await el.isVisible({ timeout: 400 })) { await el.fill(code); filled = true; log(`filled: ${s}`); break; } } catch {}
            }
            if (filled) break;
          }
          if (!filled) log("fill-FAILED");
          // 提交：按钮文案可能是"确 定"带空格，用正则；填码框回车兜底
          let submitted = false;
          for (const f of page.frames()) {
            try {
              const btn = f.locator('button, a, input[type=button], input[type=submit]').filter({ hasText: /确\s*定/ }).first();
              if (await btn.isVisible({ timeout: 400 })) { await btn.click({ force: true }); submitted = true; log("submit: 确定(regex)"); break; }
            } catch {}
            try {
              const inp = f.locator('input[value*=确], input[value*=提], input[value*=验]').first();
              if (await inp.isVisible({ timeout: 300 })) { await inp.click({ force: true }); submitted = true; log("submit: input[value]"); break; }
            } catch {}
          }
          if (!submitted) {
            try {
              for (const f of page.frames()) {
                const el = f.locator("input[placeholder*=验证码]").first();
                if (await el.isVisible({ timeout: 300 })) { await el.press("Enter"); submitted = true; log("submit: Enter"); break; }
              }
            } catch {}
          }
          if (!submitted) log("submit-FAILED");
          await page.waitForTimeout(3000);
          await page.screenshot({ path: "/mnt/agents/output/1688验证页.png" });
          // 校验是否报错（验证码错误/过期）
          try {
            const bodyTxt = await page.textContent("body") ?? "";
            for (const f of page.frames()) { try { const t = await f.textContent("body"); if (t && /验证码.{0,6}(错误|不正确|失效|过期)/.test(t)) { log("CODE-REJECTED: 验证码错误"); break; } } catch {} }
            if (/验证码.{0,6}(错误|不正确|失效|过期)/.test(bodyTxt)) log("CODE-REJECTED: 验证码错误");
          } catch {}
        } else log("code-TIMEOUT");
      }
      // 等跳转出登录域（最多 90s）
      for (let j = 0; j < 18; j++) {
        await page.waitForTimeout(5000);
        u = page.url();
        if (!/login\.(taobao|1688|alibaba)\.com/.test(u)) break;
        if (j % 3 === 2) await page.screenshot({ path: "/mnt/agents/output/1688验证页.png" });
      }
      await page.screenshot({ path: "/mnt/agents/output/1688验证页.png" });
      fs.writeFileSync(SESSION, JSON.stringify(await ctx.storageState(), null, 2));
      fs.chmodSync(SESSION, 0o600);
      const offLogin = !/login\.(taobao|1688|alibaba)\.com/.test(u);
      log(offLogin ? `LOGGED-IN url=${u.slice(0, 100)}` : `STUCK-AT-VERIFY url=${u.slice(0, 100)}`);
      // 终验：真实访问工作台，未被踢回登录页才算会话可用
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
    // 自动刷新已禁用（refresh 抽风会顶掉用户正在扫的码）；过期就整体重启脚本出新会话
    if (Date.now() - lastShot > 20000) {
      try { await shot(target); lastShot = Date.now(); } catch (e: any) { log(`reshot-err: ${String(e.message).slice(0, 80)}`); }
    }
  }
  log("TIMEOUT: 15分钟内未登录");
  await browser.close();
  process.exit(1);
}
main().catch((e) => { log(`FATAL: ${String(e?.message ?? e).slice(0, 200)}`); process.exit(1); });
