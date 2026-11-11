// 多语言零残留巡检（罗总 2026-11-11 指令：不能再靠老板肉眼找漏翻——机器逐页逐语言扫，有残留就 FAIL）
// 用法：npx tsx db/i18n-scan.ts  —— en/es/fr/pt × 核心页面，扫直接文本节点 + placeholder 里的中文字符
// 退出码：0=全部干净；1=有残留（打印页面×语言×残留片段清单）
// 巡检器 = 预热器 + 判官一体：首扫触发接口 fire-and-forget 翻译铺满终身缓存；
// 有残留的页 20s 后重载重扫一次（此时缓存已热、命中快路径），重扫仍有残留才判 FAIL。
// 白名单：[data-i18n-skip] 子树不扫（语言选择器的选项名按国际惯例保留原名"中文"等）。
import { chromium, type Page } from "playwright-core";

const BASE = process.env.SCAN_BASE ?? "http://localhost:3200";
const LANGS = ["en", "es", "fr", "pt"] as const;

const PREFILL = encodeURIComponent(
  'I saw "Handmade Press-on Nails" on the best-seller radar — find me matching factories and the landed cost'
);

type PageSpec = {
  name: string;
  path: string;
  waitSelector: string; // 内容就绪标志
  timeoutMs?: number;
  skuSettle?: boolean; // 详情页：等 SKU 轮询把中文规格渐进翻完
};

const PAGES: PageSpec[] = [
  { name: "首页", path: "/", waitSelector: "article" },
  { name: "雷达页", path: "/radar", waitSelector: "article" },
  { name: "工厂列表", path: "/factories", waitSelector: 'a[href^="/factories/"]' },
  { name: "商品详情", path: "/products/840699102922", waitSelector: "h1", skuSettle: true },
  { name: "工厂档案", path: "/factories/208", waitSelector: "h1" },
  { name: "对话页雷达CTA", path: `/buyer?radar=2&prefill=${PREFILL}`, waitSelector: 'a[href^="/products/"]', timeoutMs: 150_000 },
];

// 只取元素直接文本节点（避免父子重复上报）+ input/textarea 的 placeholder；跳过 [data-i18n-skip] 子树
async function collectZh(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const RE = /[\u4e00-\u9fff]/;
    const hits: string[] = [];
    document.querySelectorAll("body *").forEach((el) => {
      // 白名单：语言选择器等按国际惯例保留原名的元素（data-i18n-skip 子树）不扫
      if (el.closest("[data-i18n-skip]")) return;
      for (const node of Array.from(el.childNodes)) {
        if (node.nodeType === 3) {
          const tx = node.textContent?.trim();
          if (tx && RE.test(tx)) hits.push(tx.slice(0, 80));
        }
      }
      const ph = (el as HTMLInputElement).placeholder;
      if (ph && RE.test(ph)) hits.push(`[placeholder] ${ph}`);
    });
    return [...new Set(hits)].slice(0, 20);
  });
}

// 访问一页并等到内容就绪（含 SKU 渐进翻译清零等待）
async function visitAndSettle(page: Page, spec: PageSpec) {
  await page.goto(BASE + spec.path, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(spec.waitSelector, { timeout: spec.timeoutMs ?? 30_000 });
  if (spec.skuSettle) {
    await page.waitForSelector(".sb-spinner", { state: "detached", timeout: 60_000 }).catch(() => {});
    const t0 = Date.now();
    for (;;) {
      const zhInTd = await page.evaluate(() => {
        const RE = /[\u4e00-\u9fff]/;
        return Array.from(document.querySelectorAll("td,button")).some((el) => RE.test((el as HTMLElement).innerText ?? ""));
      });
      if (!zhInTd) break;
      if (Date.now() - t0 > 90_000) break; // 超时交给后面统一上报
      await page.waitForTimeout(4_000);
    }
  } else {
    await page.waitForTimeout(1_500); // 异步区块（统计/卡片）兜底
  }
}

const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
let fail = 0;

for (const lang of LANGS) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript((l) => localStorage.setItem("sb-lang", l), lang);
  const page = await ctx.newPage();
  for (const spec of PAGES) {
    try {
      await visitAndSettle(page, spec);
      let hits = await collectZh(page);
      if (hits.length) {
        // 首扫有残留：本次访问已触发后台翻译填缓存，等 90s（盖过多批串行+单批 30s 超时窗口）重载重扫——缓存热后快路径应全命中
        console.log(`… [${lang}] ${spec.name} 首扫 ${hits.length} 处，90s 后重扫判定`);
        await page.waitForTimeout(90_000);
        await visitAndSettle(page, spec);
        hits = await collectZh(page);
      }
      if (hits.length) {
        fail++;
        console.log(`✗ [${lang}] ${spec.name}（${spec.path}）残留 ${hits.length} 处：`);
        for (const h of hits) console.log(`    ${h}`);
      } else {
        console.log(`✓ [${lang}] ${spec.name}`);
      }
    } catch (e) {
      fail++;
      console.log(`✗ [${lang}] ${spec.name}（${spec.path}）加载失败：${e instanceof Error ? e.message.split("\n")[0] : e}`);
    }
  }
  await ctx.close();
}

await browser.close();
console.log(fail === 0 ? `\n═══ i18n 巡检通过：${LANGS.length} 语言 × ${PAGES.length} 页 零中文残留 ═══` : `\n═══ i18n 巡检 FAIL：${fail} 个页面×语言组合有残留 ═══`);
process.exit(fail === 0 ? 0 : 1);
