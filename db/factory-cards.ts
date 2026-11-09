/// <reference lib="dom" />
// 1688 登录态工厂搜索卡采集器：回填 home/oem_mode/production_type/years/repurchase_rate/area_sqm/cert/seller_user_id/member_id/主营tags
// 纪律：评分列绝不写；缺失保持 NULL 不填 0；默认 dry-run（DRY=0 才落库）；限流 ~3s；成本 0 落台账 provider='1688web'
// 幂等续跑：cards_checked_at 非空即跳过；未命中也标记，避免死循环。想重采：UPDATE factories SET cards_checked_at=NULL WHERE ...
process.loadEnvFile();
import { chromium, type Browser, type Page } from "playwright-core";
import iconv from "iconv-lite";
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
import fs from "fs";

const DRY = process.env.DRY !== "0";
const LIMIT = Number(process.env.LIMIT || 10);
const SESSION = "/mnt/agents/output/app/.1688-session.json";
const REPORT = "/mnt/agents/output/app/factory-cards-report.jsonl";
const DEAD_SENTINEL = "/mnt/agents/output/app/.1688-session-dead";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function gbkUrlEncode(s: string): string {
  return iconv.encode(s, "gbk").toString("hex").replace(/(..)/g, "%$1").toUpperCase();
}

interface Card {
  name: string; winport: string; memberId: string; isAd: boolean;
  years: number | null; repurchase: number | null; ptype: string | null;
  oem: string[]; areaSqm: number | null; position: string | null;
  mainCraft: string | null; cert: string | null; loginId: string | null;
  isSuper: boolean;
}

async function ensureColumn(db: any) {
  const [c]: any = await db.execute(sql`SHOW COLUMNS FROM factories LIKE 'cards_checked_at'`);
  if (!c.length) {
    await db.execute(sql`ALTER TABLE factories ADD COLUMN cards_checked_at DATETIME NULL`);
    console.log("已加列 cards_checked_at");
  }
}

async function newBrowser(): Promise<Browser> {
  return chromium.launch({
    executablePath: "/usr/bin/chromium", headless: true,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-dev-shm-usage"],
  });
}

async function newPage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({
    storageState: SESSION,
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 }, locale: "zh-CN",
  });
  return ctx.newPage();
}

async function parseCards(page: Page): Promise<Card[]> {
  return page.evaluate(() => {
    const out: any[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("div.company-offer-card"))) {
      const rep = el.getAttribute("data-aplus-report") ?? "";
      const memberM = rep.match(/member_id@(b2b-[a-z0-9]+)/i);
      const isAd = /_p_isad@1/.test(rep);
      const a = el.querySelector<HTMLAnchorElement>("a.company-name");
      if (!a) continue;
      const wpM = (a.href ?? "").match(/https?:\/\/([a-z0-9-]+)\.1688\.com/i);
      const yearM = (el.querySelector(".integrity-year")?.textContent ?? "").match(/(\d+)\s*年/);
      const blueTags = Array.from(el.querySelectorAll(".blue-tag")).map((t) => (t.textContent ?? "").trim()).filter(Boolean);
      const PTYPES = ["生产加工", "经销批发", "品牌代工", "商业服务", "招商代理"];
      const ptype = blueTags.find((t) => PTYPES.includes(t)) ?? null;
      const oem = Array.from(el.querySelectorAll(".service-info > span > span")).map((t) => (t.textContent ?? "").trim()).filter(Boolean);
      const info: Record<string, string> = {};
      for (const it of Array.from(el.querySelectorAll<HTMLElement>(".info-item"))) {
        const t = it.querySelector(".company-info-title")?.textContent?.trim() ?? "";
        const d = it.querySelector(".company-info-data")?.textContent?.trim() ?? "";
        if (t) info[t] = d;
      }
      const repM = (info["回头率"] ?? "").match(/(\d+(?:\.\d+)?)\s*%/);
      const areaM = (info["厂房面积"] ?? "").match(/(\d+)/);
      const authA = el.querySelector<HTMLAnchorElement>("a.authentication-href");
      const loginM = (authA?.href ?? "").match(/loginId=([^&]+)/);
      out.push({
        name: (a.textContent ?? "").trim(),
        winport: wpM ? wpM[1] : "",
        memberId: memberM ? memberM[1] : "",
        isAd,
        years: yearM ? Number(yearM[1]) : null,
        repurchase: repM ? Number(repM[1]) : null,
        ptype,
        oem,
        areaSqm: areaM ? Number(areaM[1]) : null,
        position: el.querySelector(".position-text")?.textContent?.trim() ?? null,
        mainCraft: el.querySelector(".main-craft-content")?.textContent?.trim() ?? null,
        cert: el.querySelector(".authentication-text")?.textContent?.trim() ?? null,
        loginId: loginM ? decodeURIComponent(loginM[1]) : null,
        isSuper: !!el.querySelector('a[title="超级工厂"]'),
      });
    }
    return out;
  });
}

const norm = (s: string) => s.replace(/\s+/g, "").replace(/（/g, "(").replace(/）/g, ")").replace(/，/g, ",");

async function main() {
  if (fs.existsSync(DEAD_SENTINEL)) { console.log("SESSION-DEAD 哨兵存在，退出"); process.exit(1); }
  const db = getDb();
  await ensureColumn(db);

  const [rows]: any = await db.execute(sql`
    SELECT id, name, member_id, seller_user_id, years, repurchase_rate, production_type, oem_mode, home, area_sqm, cert, tags
    FROM factories
    WHERE is_trader=0 AND dup_of IS NULL AND cards_checked_at IS NULL
      AND (home IS NULL OR home='' OR oem_mode IS NULL OR production_type IS NULL
           OR member_id NOT REGEXP '^b2b-[0-9]' OR years IS NULL OR repurchase_rate IS NULL
           OR seller_user_id IS NULL OR seller_user_id='')
    ORDER BY FIELD(tier,'金标','银标','铜标','优选','培育'), id LIMIT ${LIMIT}`);
  if (!rows.length) { console.log("完成：无待采集行"); process.exit(0); }
  console.log(`本轮目标 ${rows.length} 家（DRY=${DRY}）`);

  let browser = await newBrowser();
  let page = await newPage(browser);
  let hit = 0, miss = 0, err = 0, consecErr = 0;

  for (let i = 0; i < rows.length; i++) {
    const f = rows[i];
    if (i > 0 && i % 150 === 0) { await browser.close().catch(() => {}); browser = await newBrowser(); page = await newPage(browser); }
    const t0 = Date.now();
    let ok = false, matched: Card | null = null, cardsN = 0, errMsg = "";
    let cands: string[] | undefined;
    try {
      await page.goto(`https://s.1688.com/company/company_search.htm?keywords=${gbkUrlEncode(f.name)}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(2200);
      const body = ((await page.textContent("body")) ?? "").replace(/\s+/g, " ");
      if (/punish|亲，请完成安全验证|滑动验证|请按住滑块/.test(page.url() + body)) {
        console.log(`[${f.id}] 风控墙，冷却 25 分钟`);
        await sleep(1500000);
        await page.goto(`https://s.1688.com/company/company_search.htm?keywords=${gbkUrlEncode(f.name)}`, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForTimeout(2200);
        const body2 = ((await page.textContent("body")) ?? "").replace(/\s+/g, " ");
        if (/punish|亲，请完成安全验证|滑动验证|请按住滑块/.test(page.url() + body2)) {
          console.log("风控墙持续，退出待看门狗重启");
          process.exit(1);
        }
      }
      const cards = await parseCards(page);
      cardsN = cards.length;
      if (!cards.length && !body.includes("没有找到相关的商家")) {
        // 可能掉登录态
        if (!body.includes("罗文0102")) { fs.writeFileSync(DEAD_SENTINEL, new Date().toISOString()); console.log("SESSION-EXPIRED，写哨兵退出"); process.exit(1); }
      }
      matched = cards.find((c) => !c.isAd && norm(c.name) === norm(f.name)) ?? null;
      if (!matched) cands = cards.filter((c) => !c.isAd).slice(0, 3).map((c) => c.name);
      ok = true;
      consecErr = 0;
    } catch (e: any) {
      errMsg = String(e?.message ?? e).slice(0, 200);
      err++; consecErr++;
      if (consecErr > 5) { console.log("连续错误>5，退出待看门狗重启"); process.exit(1); }
    }

    const writes: Record<string, unknown> = {};
    if (ok) {
      if (matched) {
        hit++;
        if (!f.home && matched.winport) writes.home = `https://${matched.winport}.1688.com`;
        if (f.years == null && matched.years != null) writes.years = matched.years;
        if (f.repurchase_rate == null && matched.repurchase != null) writes.repurchase_rate = matched.repurchase;
        if (!f.production_type && matched.ptype) writes.production_type = matched.ptype;
        if (!f.oem_mode && matched.oem.length) writes.oem_mode = matched.oem.join("/");
        if (f.area_sqm == null && matched.areaSqm != null) writes.area_sqm = matched.areaSqm;
        if (!f.cert && matched.cert) writes.cert = matched.cert.replace(/\s*\|\s*$/, "");
        const uidM = matched.memberId.match(/^b2b-(\d+)/);
        if ((!f.seller_user_id || f.seller_user_id === "") && uidM) writes.seller_user_id = uidM[1];
        if (!/^b2b-\d/.test(f.member_id ?? "") && matched.memberId) {
          const [dup]: any = await db.execute(sql`SELECT id FROM factories WHERE member_id=${matched.memberId} AND id<>${f.id} LIMIT 1`);
          if (!dup.length) writes.member_id = matched.memberId; else writes.member_id_collision = dup[0].id;
        }
        if (matched.mainCraft) {
          // mysql2 对 JSON 列自动解析，tags 双形态都要接
          let tags: string[] = [];
          if (Array.isArray(f.tags)) tags = f.tags.map(String);
          else { try { tags = JSON.parse(f.tags ?? "[]"); } catch { tags = []; } }
          const add = matched.mainCraft.split(/[|、,，]/).map((s) => s.trim()).filter((s) => s && !tags.includes(s));
          if (add.length) writes.tags = JSON.stringify([...tags, ...add]);
        }
        if (!DRY) {
          const { member_id_collision, ...real } = writes;
          const keys = Object.keys(real).filter((k) => /^[a-z_]+$/.test(k));
          if (keys.length) {
            const sets = keys.map((k) => sql`${sql.raw(k)} = ${real[k] as any}`);
            await db.execute(sql`UPDATE factories SET ${sql.join(sets, sql`, `)} WHERE id=${f.id}`);
          }
        }
      } else miss++;
      if (!DRY) {
        await db.execute(sql`UPDATE factories SET cards_checked_at=NOW() WHERE id=${f.id}`);
      }
      fs.appendFileSync(REPORT, JSON.stringify({ id: f.id, name: f.name, matched: !!matched, cardName: matched?.name ?? null, winport: matched?.winport ?? null, cards: cardsN, cands, writes, ts: new Date().toISOString() }) + "\n");
    }

    // 台账（成本 0）
    await db.execute(sql`INSERT INTO sourcing_api_logs (provider, endpoint, query, cost_cny, billed, ok, duration_ms, error) VALUES ('1688web','company_search',${f.name},0,false,${ok},${Date.now() - t0},${errMsg || null})`).catch(() => {});

    if ((i + 1) % 10 === 0 || i === rows.length - 1) console.log(`进度: ${i + 1}/${rows.length} 命中 ${hit} 未匹配 ${miss} 错误 ${err}`);
    await sleep(5000 + Math.random() * 5000);
  }
  await browser.close().catch(() => {});
  const [left]: any = await db.execute(sql`SELECT COUNT(*) c FROM factories WHERE is_trader=0 AND dup_of IS NULL AND cards_checked_at IS NULL AND (home IS NULL OR home='' OR oem_mode IS NULL OR production_type IS NULL OR member_id NOT REGEXP '^b2b-[0-9]' OR years IS NULL OR repurchase_rate IS NULL OR seller_user_id IS NULL OR seller_user_id='')`);
  console.log(`完成：本轮 ${rows.length} 家，命中 ${hit}，未匹配 ${miss}，错误 ${err}；剩余 ${left[0].c}`);
  process.exit(0);
}
main().catch((e) => { console.log("FATAL:", String(e?.message ?? e).slice(0, 300)); process.exit(1); });
