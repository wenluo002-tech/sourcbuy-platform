// 外部零售平台链接解析：买家贴亚马逊/TikTok/独立站等链接 → 提取品名/图/海外售价
// 原则：能读到什么说什么，读不到诚实标 fetchFailed，绝不编；1688 等上游链接不走这里（走 extractOfferId 老链路）
import { log } from "../lib/logger";

export interface LinkContext {
  url: string;
  platform: string; // 展示名：亚马逊 / TikTok Shop / eBay …
  title: string | null;
  image: string | null;
  priceText: string | null; // 如 "$16.99"
  source: "page" | "slug" | null; // 标题来源：抓到了页面 / 只从链接路径猜的
  fetchFailed?: boolean;
}

const PLATFORM_RULES: { re: RegExp; name: string }[] = [
  { re: /(^|\.)amazon\./i, name: "亚马逊" },
  { re: /(^|\.)tiktok\.com$/i, name: "TikTok Shop" },
  { re: /(^|\.)aliexpress\./i, name: "AliExpress" },
  { re: /(^|\.)ebay\./i, name: "eBay" },
  { re: /(^|\.)temu\.com$/i, name: "Temu" },
  { re: /(^|\.)shein\./i, name: "SHEIN" },
  { re: /(^|\.)walmart\.com$/i, name: "Walmart" },
  { re: /(^|\.)etsy\.com$/i, name: "Etsy" },
  { re: /(^|\.)shop\.app$/i, name: "Shop App" },
  { re: /myshopify\.com$/i, name: "Shopify 独立站" },
];

/** 从消息里提取第一个外部零售链接；1688 链接返回 null（由 extractOfferId 处理） */
export function extractExternalUrl(message: string): string | null {
  const m = message.match(/https?:\/\/[^\s"'<>)\]，。]+/i);
  if (!m) return null;
  const url = m[0].replace(/[.,;!?)]+$/, "");
  try {
    const u = new URL(url);
    if (/(^|\.)1688\.com$/i.test(u.hostname)) return null;
    if (/(^|\.)sourcbuy\.com$/i.test(u.hostname)) return null; // 自己家的链接不解析
    return url;
  } catch {
    return null;
  }
}

// URL 路径里的人类可读词段 → 标题兜底（亚马逊 /Product-Name/dp/ASIN、Shopify /products/name、eBay /itm/name 等）
const SLUG_NOISE = /^(dp|gp|item|itm|products?|listing|listings|ip|p|sku|shop|detail|offer|www|m|aw|e)$/i;
function slugToTitle(url: string): string | null {
  try {
    const u = new URL(url);
    const segs = u.pathname.split("/").filter(Boolean);
    const cands = segs.filter(
      (s) =>
        !SLUG_NOISE.test(s) &&
        !/^[A-Z0-9]{8,}$/.test(s) && // ASIN/货号：全大写+数字
        !/^\d{5,}$/.test(s) && // 纯数字 ID
        /[a-zA-Z]/.test(s) &&
        /[-_]/.test(s) && // 真实 slug 必然带连字符（短链随机串如 ZSabcdef 直接排除）
        s.replace(/[-_]/g, "").length >= 8,
    );
    const best = cands.sort((a, b) => b.length - a.length)[0];
    if (!best) return null;
    const t = decodeURIComponent(best)
      .replace(/\.(html?|aspx?|php|jsp)$/i, "")
      .replace(/[-_+]+/g, " ")
      .trim();
    return t.length >= 6 ? t : null;
  } catch {
    return null;
  }
}

function cleanPageTitle(raw: string | null): string | null {
  if (!raw) return null;
  let t = raw.replace(/\s+/g, " ").trim();
  // 反爬/验证页识别：亚马逊 Robot Check、Sorry 页等——这些不是商品标题
  if (/robot check|are you a robot|sorry! we just need|captcha|access denied|just a moment/i.test(t)) return null;
  // 亚马逊 og:title 常带 "Amazon.com: xxx" 前缀与 ": Tools & Home Improvement" 类目后缀
  t = t.replace(/^amazon\.[a-z.]+\s*[:：]\s*/i, "");
  t = t.replace(/\s*[:：]\s*Amazon\.[a-z.]+.*$/i, "");
  t = t.replace(/\s*[|｜-]\s*(TikTok Shop|eBay|AliExpress|Temu|SHEIN|Walmart|Etsy).*$/i, "");
  if (/^(amazon\.[a-z.]+|tiktok|ebay\.[a-z.]+|aliexpress\.[a-z.]+|temu|shein|walmart\.com|etsy\.com)$/i.test(t)) return null; // 只剩平台名=没读到标题
  if (t.length > 140) t = t.slice(0, 140);
  return t.length >= 4 ? t : null;
}

const CUR_SYM: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", JPY: "¥", CNY: "¥", CAD: "C$", AUD: "A$" };

/** 抓页面 og 元数据：6s 封顶，失败静默返回空（调用方回落 slug 解析） */
async function fetchPageMeta(url: string): Promise<{ title: string | null; image: string | null; priceText: string | null }> {
  const empty = { title: null, image: null, priceText: null };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) return empty;
    const html = (await res.text()).slice(0, 400_000);
    const pick = (re: RegExp): string | null => html.match(re)?.[1]?.trim() || null;
    const title =
      pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i) ??
      pick(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i) ??
      pick(/<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)/i) ??
      pick(/<title[^>]*>([^<]+)</i);
    const image =
      pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i) ??
      pick(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    const priceAmount =
      pick(/property=["'](?:product:price:amount|og:price:amount)["'][^>]+content=["']([\d.,]+)/i) ??
      pick(/"price"\s*:\s*"?(\d+(?:\.\d{1,2})?)"?/i);
    const priceCur =
      pick(/property=["'](?:product:price:currency|og:price:currency)["'][^>]+content=["']([A-Z]{3})/i) ??
      pick(/"priceCurrency"\s*:\s*"([A-Z]{3})"/i);
    const priceText = priceAmount ? `${CUR_SYM[priceCur ?? "USD"] ?? (priceCur ? priceCur + " " : "$")}${priceAmount}` : null;
    return { title, image, priceText };
  } catch {
    return empty;
  } finally {
    clearTimeout(timer);
  }
}

/** 解析外部零售链接；返回 null 表示这不是我们认识的链接（按普通消息处理） */
export async function resolveExternalLink(url: string): Promise<LinkContext | null> {
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  const platform = PLATFORM_RULES.find((r) => r.re.test(host))?.name ?? host.replace(/^www\./, "");
  const slugTitle = slugToTitle(url);
  let meta: Awaited<ReturnType<typeof fetchPageMeta>>;
  try {
    meta = await fetchPageMeta(url);
  } catch (e) {
    log.warn("外链抓取失败，回落 slug 解析", { url: url.slice(0, 120), error: e instanceof Error ? e.message : String(e) });
    meta = { title: null, image: null, priceText: null };
  }
  const pageTitle = cleanPageTitle(meta.title);
  const title = pageTitle ?? slugTitle;
  // 页面返回了内容但被判定为反爬/验证页（有原始标题却清洗为空）→ 图和价格同样不可信，一并丢弃
  const pageBlocked = !!meta.title && !pageTitle;
  const image = pageBlocked ? null : meta.image;
  const priceText = pageBlocked ? null : meta.priceText;
  if (!title && !image) {
    // 什么都没读到（短链/反爬/网络挂）——诚实标记，话术里让买家补品名
    return { url, platform, title: null, image: null, priceText: null, source: null, fetchFailed: true };
  }
  return { url, platform, title, image, priceText, source: pageTitle ? "page" : "slug" };
}
