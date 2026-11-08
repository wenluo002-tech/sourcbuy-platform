// M4a 端到端截图验证：匿名/登录双态 × 桌面/移动端，覆盖 dashboard/addresses/notifications/inquiries/buyer?thread=
import { chromium } from "playwright-core";

const BASE = "http://localhost:3200";
const OUT = "/tmp/m4a-shots";
const EMAIL = `m4atest${Date.now()}@test.com`;
const PASS = "Test1234!";

async function trpcMut(path: string, input: unknown, cookie?: string) {
  const res = await fetch(`${BASE}/api/trpc/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ json: input ?? null }),
  });
  const setCookie = res.headers.get("set-cookie") || "";
  const text = await res.text();
  return { status: res.status, setCookie, text: text.slice(0, 300) };
}

const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });

async function shot(name: string, url: string, opts: { mobile?: boolean; cookie?: string; wait?: number } = {}) {
  const ctx = await browser.newContext({
    viewport: opts.mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    locale: "zh-CN",
  });
  if (opts.cookie) {
    const [pair] = opts.cookie.split(";");
    const [k, v] = pair.split("=");
    await ctx.addCookies([{ name: k, value: v, url: BASE }]);
  }
  const page = await ctx.newPage();
  await page.goto(`${BASE}${name === "home" ? "/" : name}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(opts.wait ?? 2600);
  // fullPage 前先滚一遍触发懒加载
  await page.evaluate(async () => {
    await new Promise<void>((res) => {
      let y = 0;
      const t = setInterval(() => {
        y += 600;
        window.scrollTo(0, y);
        if (y >= document.body.scrollHeight) { clearInterval(t); res(); }
      }, 80);
    });
  });
  await page.waitForTimeout(1200);
  const file = `${OUT}/${name.replace(/[/?=&]/g, "_")}${opts.mobile ? "_m" : ""}${opts.cookie ? "_auth" : ""}.png`;
  await page.screenshot({ path: file, fullPage: true });
  console.log("SHOT", file);
  await ctx.close();
  return file;
}

// 1) 注册+登录拿 cookie
const reg = await trpcMut("auth.register", { email: EMAIL, password: PASS, displayName: "M4A测试", locale: "zh" });
console.log("register:", reg.status, reg.text.slice(0, 120));
const login = await trpcMut("auth.login", { email: EMAIL, password: PASS });
console.log("login:", login.status, login.text.slice(0, 120));
const cookie = login.setCookie;
if (!cookie) { console.error("NO COOKIE"); process.exit(1); }

// 2) 造数据：创建两条地址（第一条应自动默认）
const a1 = await trpcMut("addresses.create", { label: "公司", contactName: "Rowan Luo", phone: "+1 415 555 0132", country: "US", state: "CA", city: "San Francisco", address1: "100 Market St", address2: "Suite 300", postcode: "94105" }, cookie);
console.log("addr1:", a1.status);
const a2 = await trpcMut("addresses.create", { label: "仓库", contactName: "Rowan Luo", phone: "+1 415 555 0132", country: "US", state: "CA", city: "Oakland", address1: "200 Harbor Way", postcode: "94607" }, cookie);
console.log("addr2:", a2.status);

// 3) 匿名态
await shot("/dashboard", "/dashboard");
await shot("/addresses", "/addresses");
await shot("/notifications", "/notifications");
await shot("/inquiries", "/inquiries");

// 4) 登录态·桌面
await shot("/dashboard", "/dashboard", { cookie });
await shot("/addresses", "/addresses", { cookie });
await shot("/notifications", "/notifications", { cookie });
await shot("/inquiries", "/inquiries", { cookie });

// 5) 登录态移动端
await shot("/dashboard", "/dashboard", { cookie, mobile: true });
await shot("/addresses", "/addresses", { cookie, mobile: true });

// 6) BuyerChat ?thread= 回放：先拿线程列表
const threads = await fetch(`${BASE}/api/trpc/threads.list?input=${encodeURIComponent(JSON.stringify({ json: null }))}`, { headers: { cookie } });
const tj: any = await threads.json();
const tid = tj?.result?.data?.json?.[0]?.id;
console.log("threads:", threads.status, "tid:", tid);
if (tid) await shot(`/buyer?thread=${tid}`, `/buyer?thread=${tid}`, { cookie, wait: 3200 });

await browser.close();
console.log("ALL_SHOTS_DONE", EMAIL);
process.exit(0);
